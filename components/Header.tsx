'use client';

import React from 'react';

interface Props {
  round: number;
  turn: number;
  topic: string;
  onLogClick: () => void;
}

/**
 * ヘッダー: ラウンド・ターン表示 + LOGボタン
 */
export const Header: React.FC<Props> = ({ round, turn, topic, onLogClick }) => {
  return (
    <div className="min-h-[74px] flex items-center justify-between px-3 border-b border-green-900 bg-black">
      <div className="px-2 min-w-0 pr-2">
        <div className="text-green-400 font-bold text-xs tracking-wider">
          ROUND {round}-{turn}
        </div>
        <div className="text-green-300/90 text-[12px] leading-snug break-words max-w-[260px]">
          お題: {topic || '読み込み中...'}
        </div>
      </div>

      {/* LOGボタン */}
      <button
        onClick={onLogClick}
        className="border-2 border-green-700 px-3 py-1 text-green-500 text-sm hover:bg-green-900/30 transition-colors flex items-center gap-1"
      >
        <span className="text-xs">≡</span>
        <span>LOG</span>
      </button>
    </div>
  );
};
