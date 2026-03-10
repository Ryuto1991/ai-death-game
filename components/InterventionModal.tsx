'use client';

import React, { useState, useEffect } from 'react';
import { INTERVENTION_CARDS } from '@/lib/constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
  onWatch: () => void;
}

/**
 * 介入モーダル: ターン開始時に表示
 * - 「介入しますか」→ 定義済みカード選択 or 見守る
 * - モデレーションチェック（API側）
 * - レトロUI
 */
export const InterventionModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, onWatch }) => {
  const [selectedCard, setSelectedCard] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestClose = () => {
    if (isSubmitting) return;
    onWatch();
  };

  // モーダル開閉時にリセット
  useEffect(() => {
    if (isOpen) {
      setSelectedCard('');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (isSubmitting) return;

    // バリデーション
    if (!selectedCard) {
      setError('カードを選択してください');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await onSubmit(selectedCard);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Enterでの送信を防止（ボタンクリックのみ）
    }
    if (e.key === 'Escape') {
      handleRequestClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleRequestClose();
      }}
    >
      <div
        className="border border-green-700 bg-black p-5 w-[90%] max-w-sm shadow-[0_0_20px_rgba(0,255,0,0.1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="mb-3">
          <h2 className="text-green-400 font-bold text-sm font-dotgothic leading-tight">
            介入カードを選択
          </h2>
        </div>

        {/* 注意事項 */}
        <div className="mb-4 text-green-700 text-xs font-dotgothic border border-green-900/50 bg-green-950/20 px-2 py-2 leading-relaxed">
          <p>・1ターンに1回だけ介入できます</p>
          <p>・ゲームルールの変更はできません</p>
        </div>

        {/* カード選択 */}
        <div className="mb-3">
          <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto pr-1">
            {INTERVENTION_CARDS.map((card) => (
              <button
                key={card}
                type="button"
                onClick={() => {
                  setSelectedCard(card);
                  if (error) setError('');
                }}
                disabled={isSubmitting}
                className={`text-left border px-3 py-2 text-xs font-dotgothic transition-colors ${
                  selectedCard === card
                    ? 'border-green-400 bg-green-900/30 text-green-300'
                    : 'border-green-800 bg-black text-green-500 hover:border-green-600'
                }`}
              >
                {card}
              </button>
            ))}
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-3 text-red-500 text-xs font-dotgothic border border-red-900/50 bg-red-950/30 px-2 py-1">
            {error}
          </div>
        )}

        {/* ボタンエリア */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedCard}
            className="w-full bg-green-500 text-black py-2 text-sm font-dotgothic font-bold hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? '確認中...' : '指示する'}
          </button>
        </div>

        {/* 区切り線 + 見守るボタン */}
        <div className="mt-[15px] pt-[15px] border-t border-green-900/50" />
        <button
          onClick={() => { if (!isSubmitting) onWatch(); }}
          disabled={isSubmitting}
          className="w-full border border-green-800 text-green-600 py-2 text-sm font-dotgothic hover:text-green-400 hover:border-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          見守る
        </button>
      </div>
    </div>
  );
};
