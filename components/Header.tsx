'use client';

import React from 'react';

interface Props {
  round: number;
  turn: number;
  onLogClick: () => void;
}

/**
 * ヘッダー: ラウンド・ターン表示 + LOGボタン
 */
export const Header: React.FC<Props> = ({ round, turn, onLogClick }) => {
  return (
    <div className="h-[50px] flex items-center justify-between px-3 border-b border-green-900 bg-black">
      <div className="px-2 min-w-0 pr-2">
        <div className="text-green-400 font-bold text-xs tracking-wider">
          ROUND {round}-{turn}
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
