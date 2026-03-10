'use client';

import React from 'react';
import { Header } from './Header';
import { StatusBar } from './StatusBar';
import { FocusArea } from './FocusArea';
import { DialogArea, ContentPhase, DialogPhase } from './DialogArea';
import { Expression } from '@/lib/types';

interface AgentData {
  id: string;
  characterId: string;
  name: string;
  isAlive: boolean;
  stageTime: number;
}

interface VoteInfo {
  votedFor?: string;
  receivedVotes: number;
}

interface GmVoteAnimation {
  targetId: string;
  addVotes: number;
}

interface CurrentDisplay {
  agentId: string | null;
  agentName: string | null;
  characterId: string | null;
  expression: Expression;
  thought: string;
  speech: string;
  isAlive: boolean;
  isMaster?: boolean;
  isEliminationReaction?: boolean; // 断末魔ログかどうか
  isExecuting?: boolean; // 処刑演出中（fainted画像表示中、タップで次へ）
}

interface Props {
  round: number;
  turn: number;
  topic: string;
  audienceGauge: number;
  agents: AgentData[];
  topicIppon: Record<string, number>;
  latestAnswers: Record<string, string>;
  currentDisplay: CurrentDisplay;
  contentPhase: ContentPhase; // 現在表示するコンテンツフェーズ（親が制御）
  contentKey?: string; // 一意のコンテンツキー（変更時にタイプライターをリセット）
  isTyping: boolean;
  waitingForTap: boolean;
  mouthOpen: boolean;
  isThinking?: boolean; // 「（考え中）」表示モード（API待ち）
  isVoting?: boolean; // 「（投票中...）」表示モード（投票API待ち）
  voteResults?: Record<string, VoteInfo>; // 投票結果情報
  showVoteInfo?: boolean; // 投票情報を表示するか
  gmVoteAnimation?: GmVoteAnimation | null; // GM投票アニメーション
  onLogClick: () => void;
  onTap: () => void;
  onTypingComplete: () => void;
  onMouthOpen: (open: boolean) => void;
  onDialogPhaseChange?: (phase: DialogPhase) => void; // ダイアログフェーズ変更通知
}

/**
 * メイン画面: 全体レイアウト
 * - Header (ROUND + LOGボタン)
 * - StatusBar (5体の小ポートレート)
 * - FocusArea (大ポートレート)
 * - DialogArea (テキスト表示 + タップ領域)
 */
export const MainScreen: React.FC<Props> = ({
  round,
  turn,
  topic,
  audienceGauge,
  agents,
  topicIppon,
  latestAnswers,
  currentDisplay,
  contentPhase,
  contentKey,
  isTyping,
  waitingForTap,
  mouthOpen,
  isThinking = false,
  isVoting = false,
  voteResults = {},
  showVoteInfo = false,
  gmVoteAnimation = null,
  onLogClick,
  onTap,
  onTypingComplete,
  onMouthOpen,
  onDialogPhaseChange,
}) => {
  const activeName = currentDisplay.agentName ?? '---';
  const aliveAgents = agents.filter((agent) => agent.isAlive);
  const leadIppon = Math.max(0, ...aliveAgents.map((agent) => topicIppon[agent.id] || 0));
  const progressLabel = isVoting
    ? '観客集計中'
    : isThinking
    ? `${activeName}が回答作成中`
    : isTyping
    ? `${activeName}の回答を表示中`
    : waitingForTap
    ? 'タップで次へ'
    : '進行中';

  const showAnswerUnderPortrait =
    !!currentDisplay.speech &&
    !isThinking &&
    !isVoting &&
    !currentDisplay.isMaster &&
    !currentDisplay.isExecuting;

  return (
    <div className="flex flex-col h-full bg-black text-green-500 max-w-2xl mx-auto">
      {/* ヘッダー: 約5% */}
      <Header round={round} turn={turn} onLogClick={onLogClick} />

      {/* お題固定バー: 試合中ずっと表示 */}
      <div className="px-3 py-2 border-b border-green-900 bg-[#031103]">
        <div className="text-[11px] text-green-500/80 font-bold">お題</div>
        <div className="text-sm text-green-200 leading-snug break-words">
          {topic || '読み込み中...'}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
          <div className="border border-green-900 bg-black/40 px-2 py-1 text-green-300">
            進行: {progressLabel}
          </div>
          <div className="border border-green-900 bg-black/40 px-2 py-1 text-green-300">
            現在: {activeName}
          </div>
        </div>
        <div className="mt-2">
          <div className="flex items-center justify-between text-[11px] text-green-500/80 font-bold">
            <span>観客ゲージ</span>
            <span>{audienceGauge}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-sm border border-green-800 bg-black/70">
            <div
              className="h-full bg-gradient-to-r from-green-700 via-green-500 to-lime-300 transition-all duration-500"
              style={{ width: `${audienceGauge}%` }}
            />
          </div>
        </div>
      </div>

      {/* ステータスバー: 約12% */}
      <StatusBar
        agents={agents}
        speakingAgentId={currentDisplay.agentId}
        voteResults={voteResults}
        showVoteInfo={showVoteInfo}
        gmVoteAnimation={gmVoteAnimation}
      />

      {/* 各キャラの最新回答一覧（見失い防止） */}
      <div className="px-3 py-2 border-b border-green-900 bg-[#041004] max-h-[152px] overflow-y-auto">
        <div className="text-[11px] text-green-500/80 font-bold">最新回答一覧</div>
        <div className="mt-1 space-y-1.5">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`text-xs leading-snug border px-2 py-1 ${
                agent.id === currentDisplay.agentId
                  ? 'border-green-400 bg-green-950/20'
                  : 'border-green-900 bg-black/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-green-400">{agent.name}</span>
                <span className={`${(topicIppon[agent.id] || 0) === leadIppon && leadIppon > 0 ? 'text-lime-300' : 'text-green-500/80'}`}>
                  IPPON {topicIppon[agent.id] || 0}
                </span>
              </div>
              <div className="text-green-100 break-words">{latestAnswers[agent.id] || '---'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* フォーカスエリア: 16:9比率で横長に */}
      <div className="h-[24%] sm:h-[28%]">
        <FocusArea
          characterId={currentDisplay.characterId}
          expression={currentDisplay.expression}
          mouthOpen={mouthOpen}
          isAlive={currentDisplay.isAlive}
        />
      </div>

      {/* キャラ直下の回答表示 */}
      <div className="px-3 py-2 border-b border-green-900 bg-[#061506] min-h-[56px]">
        {showAnswerUnderPortrait ? (
          <div className="text-green-100 text-sm leading-snug break-words">
            {currentDisplay.speech}
          </div>
        ) : (
          <div className="text-green-700 text-xs">回答待機中...</div>
        )}
      </div>

      {/* ダイアログエリア: 約43% */}
      <div className="flex-1 min-h-0">
        <DialogArea
          agentName={currentDisplay.agentName}
          agentId={currentDisplay.agentId}
          thought={currentDisplay.thought}
          speech={currentDisplay.speech}
          contentPhase={contentPhase}
          contentKey={contentKey}
          isTyping={isTyping}
          waitingForTap={waitingForTap}
          isMaster={currentDisplay.isMaster}
          isEliminationReaction={currentDisplay.isEliminationReaction}
          isThinking={isThinking}
          isVoting={isVoting}
          isExecuting={currentDisplay.isExecuting}
          onTap={onTap}
          onTypingComplete={onTypingComplete}
          onMouthOpen={onMouthOpen}
          onPhaseChange={onDialogPhaseChange}
        />
      </div>
    </div>
  );
};
