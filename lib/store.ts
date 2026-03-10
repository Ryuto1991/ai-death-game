// ============================================
// ゲームストア
// 疎結合設計: 自動遷移を廃止し、明示的なアクションで制御
// ============================================

import { create } from 'zustand';
import {
  Agent,
  Expression,
  LogEntry,
  LogType,
  GamePhase,
  UserVote,
  GameStats,
  UserVoteHistory,
  UIState,
  DiscussionBatchItem,
} from './types';
import { INITIAL_UI_STATE } from './uiState';
import {
  INITIAL_STAGE_TIME,
  MASTER_CHARACTER,
  MASTER_LINES,
  OGIRI_TOPICS,
} from './constants';
import { AGENT_PERSONALITIES } from './characters';
import { getMaxAchievedRarity } from './hiddenCharacter';
import { parseStreamResponse } from './turnResponseParser';
import { timerRegistry } from './timerRegistry';
import { gameConfig } from './config';


// ============================================
// 投票情報の型
// ============================================

interface VoteInfo {
  votedFor?: string;
  receivedVotes: number;
}

// 投票結果キャッシュの型
interface CachedVoteResult {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
}

// 退場キューの型
interface EliminationQueueItem {
  agentId: string;
  agentName: string;
  characterId: string;
  reaction?: string; // 断末魔セリフ（API取得後にセット）
}



// ============================================
// ストアの型定義
// ============================================

interface GameStore {
  // State
  gameSessionId: string;
  playCountConsumed: boolean;
  phase: GamePhase;
  round: number;
  roundTopic: string;
  currentTurnInRound: number; // ラウンド内ターン番号（1始まり、ターン周回ごとに+1）
  agents: Agent[];
  logs: LogEntry[];
  currentTurnIndex: number;
  currentVoteIndex: number; // 投票の進行インデックス
  voteTallies: Record<string, number>; // 投票集計（投票先ID → 票数）
  isProcessing: boolean;
  isAnimating: boolean;
  currentAnimatingLogId: string | null;
  voteResults: Record<string, VoteInfo>;

  // 疎結合用: フェーズ完了フラグ
  discussionComplete: boolean;  // 議論フェーズ完了
  votingComplete: boolean;      // 投票フェーズ完了

  // 投票結果キャッシュ（並列取得した結果を保持）
  cachedVoteResults: CachedVoteResult[];
  votingFetchComplete: boolean;  // 全投票のAPI取得完了

  // ユーザー投票（GM投票）
  userVote: UserVote | null;

  // 退場演出用
  eliminationQueue: EliminationQueueItem[];  // 退場待ちキュー
  currentEliminationIndex: number;           // 現在処理中の退場者インデックス
  eliminationReactionsFetched: boolean;      // 断末魔API取得完了フラグ
  executingAgentId: string | null;           // 現在処刑演出中のエージェントID

  // 勝利演出用
  winnerIds: string[];                       // 勝者のエージェントID（1人または2人）
  victoryCommentsFetched: Record<string, boolean>;  // 各勝者の勝利コメントAPI取得完了フラグ
  currentVictoryIndex: number;               // 現在表示中の勝者インデックス（複数勝者対応）

  // ゲーム統計（実績用）
  gameStats: GameStats;

  // 現在のAbortController（キャンセル用）
  currentAbortController: AbortController | null;

  // 統一UI状態マシン
  uiState: UIState;

  // 議論バッチ用
  discussionBatchQueue: DiscussionBatchItem[];
  generationEpoch: number;

  // BYOK
  isByok: boolean;
  byokApiKey: string | null;
  byokGmInstruction: string | null;
  byokError: string | null;

  // Actions
  initializeGame: () => void;
  setByokMode: (isByok: boolean, apiKey: string | null) => void;
  setByokGmInstruction: (instruction: string | null) => void;
  setByokError: (error: string | null) => void;
  setUIState: (state: UIState) => void;
  startGame: () => void;
  addLog: (type: LogType, content: string, agentId?: string, extra?: {
    thought?: string;
    speech?: string;
    thoughtExpression?: Expression;
    speechExpression?: Expression;
    isStreaming?: boolean;
    rawStreamText?: string;
  }) => string;
  updateLogStream: (logId: string, rawStreamText: string) => void;
  finalizeLogStream: (logId: string) => void;
  removeLastLog: () => void;  // 先読みログ削除用（介入時に使用）
  setAgentSpeaking: (agentId: string, isSpeaking: boolean) => void;
  setAgentExpression: (agentId: string, expression: Expression) => void;
  setAgentMouthOpen: (agentId: string, mouthOpen: boolean) => void;

  // 疎結合: 各ターンはSignal付きで実行可能
  processDiscussionTurn: (signal?: AbortSignal) => Promise<void>;

  // 投票を並列で先に取得
  fetchAllVotesParallel: () => Promise<void>;
  // 次の投票ログを表示（キャッシュから）。全員表示完了時はtrueを返す
  showNextVoteLog: () => boolean;
  // ユーザー投票をセット
  setUserVote: (vote: UserVote) => void;
  // GM投票を公開（ログ追加）
  showGmVoteLog: () => void;

  // 疎結合: 自動遷移ではなく明示的なアクション
  advanceToVoting: () => void;
  advanceToResolution: () => void;
  advanceToNextRound: () => void;

  applyVotingResult: () => { eliminated: string[]; penalized: string[] }; // 結果を返すように変更
  fetchEliminationReactions: () => Promise<void>; // 断末魔APIを並列取得
  showNextEliminationReaction: () => void; // 次の断末魔を表示
  startElimination: (agentId: string) => void; // 退場演出開始（fainted表示、音再生）
  finishElimination: (agentId: string) => void; // 退場完了（isAlive=false、DELETEDログ）
  confirmElimination: (agentId: string) => void; // 退場を確定（後方互換）
  shuffleAgents: () => void;
  shuffleSelectedAgents: () => void; // メンバー選定画面用：10人から再度5人を選出
  nextRound: () => void;
  endGame: () => void;
  resetGame: () => void;
  recordVote: (voterId: string, targetId: string) => void;
  clearVoteResults: () => void;
  setAnimationComplete: (logId: string) => void;

  // キャンセル用
  cancelCurrentOperation: () => void;
}

// ============================================
// ヘルパー関数
// ============================================

// Fisher-Yatesシャッフル
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// ゲーム参加人数
const GAME_PARTICIPANT_COUNT = 5;
const RECENT_LOGS_LIMIT_FOR_AI = 12;
const PRESSURED_STAGE_TIME = 1;

const pickRandomTopic = (): string => {
  const idx = Math.floor(Math.random() * OGIRI_TOPICS.length);
  return OGIRI_TOPICS[idx] || '今日のお題は自由回答';
};

const createAgents = (): Agent[] => {
  // 最高到達レア度に応じてプールを決定（unlockTier未設定=常時使用可能）
  const maxRarity = getMaxAchievedRarity();
  const availablePersonalities = AGENT_PERSONALITIES.filter(
    p => !p.unlockTier || p.unlockTier <= maxRarity
  );

  // デバッグ用参加人数（設定があれば使用、なければ5人）
  const participantCount = gameConfig.getValue('debugParticipantCount') ?? GAME_PARTICIPANT_COUNT;

  // プールからランダムに選出
  const shuffledPersonalities = shuffleArray([...availablePersonalities]);
  const selectedPersonalities = shuffledPersonalities.slice(0, participantCount);

  // 選出されたキャラクターからエージェントを作成
  const agents = selectedPersonalities.map((p, i) => ({
    id: `agent-${i}`,
    characterId: p.characterId,
    name: p.name,
    isAlive: true,
    stageTime: INITIAL_STAGE_TIME,
    status: 'normal' as const,
    stats: p.stats,
    isSpeaking: false,
    tone: p.tone,
    currentExpression: 'default' as Expression,
    mouthOpen: false,
  }));

  // 発言順もシャッフル
  return shuffleArray(agents);
};

const generateLogId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

const generateGameSessionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// ============================================
// Zustand ストア
// 注: 今後、このファイルは gameStore.ts と uiStore.ts に
// 完全に移行予定です。新規コードではそちらを使用してください。
// ============================================

export const useGameStore = create<GameStore>((set, get) => ({
  // 初期状態
  gameSessionId: generateGameSessionId(),
  playCountConsumed: false,
  phase: GamePhase.IDLE,
  round: 1,
  roundTopic: '',
  currentTurnInRound: 1,
  agents: [],
  logs: [],
  currentTurnIndex: 0,
  currentVoteIndex: 0,
  voteTallies: {},
  isProcessing: false,
  isAnimating: false,
  currentAnimatingLogId: null,
  voteResults: {},

  // 疎結合用: フェーズ完了フラグ
  discussionComplete: false,
  votingComplete: false,

  // 投票結果キャッシュ
  cachedVoteResults: [],
  votingFetchComplete: false,

  // ユーザー投票（GM投票）
  userVote: null,

  // 退場演出用
  eliminationQueue: [],
  currentEliminationIndex: 0,
  eliminationReactionsFetched: false,
  executingAgentId: null,

  // 勝利演出用
  winnerIds: [],
  victoryCommentsFetched: {},
  currentVictoryIndex: 0,

  // ゲーム統計（実績用）
  gameStats: {
    totalRounds: 0,
    userVoteHistory: [],
    forceEliminateCount: 0,
    oneVoteCount: 0,
    watchCount: 0,
    interventionCount: 0,
    lastEliminationCount: 0,
    selfSacrificeCount: 0,
  },

  // 現在のAbortController
  currentAbortController: null,

  // 議論バッチ用
  discussionBatchQueue: [],
  generationEpoch: 0,

  // BYOK
  isByok: true,
  byokApiKey: null,
  byokGmInstruction: null,
  byokError: null,

  // 統一UI状態マシン
  uiState: INITIAL_UI_STATE,

  setByokMode: (isByok, apiKey) => set({ isByok, byokApiKey: apiKey }),

  setByokGmInstruction: (instruction) => set({ byokGmInstruction: instruction }),

  setByokError: (error) => set({ byokError: error }),

  // setUIState アクション
  setUIState: (state: UIState) => {
    set({ uiState: state });
  },

  // ゲーム初期化
  initializeGame: () => {
    // タイマーをリセット
    timerRegistry.cancelAll();

    set({
      gameSessionId: generateGameSessionId(),
      playCountConsumed: false,
      agents: createAgents(),
      logs: [],
      phase: GamePhase.IDLE,
      round: 1,
      roundTopic: '',
      currentTurnInRound: 1,
      currentTurnIndex: 0,
      currentVoteIndex: 0,
      voteTallies: {},
      isProcessing: false,
      discussionComplete: false,
      votingComplete: false,
      cachedVoteResults: [],
      votingFetchComplete: false,
      userVote: null,
      eliminationQueue: [],
      currentEliminationIndex: 0,
      eliminationReactionsFetched: false,
      executingAgentId: null,
      winnerIds: [],
      victoryCommentsFetched: {},
      currentVictoryIndex: 0,
      currentAbortController: null,
      discussionBatchQueue: [],
      generationEpoch: 0,
    });
  },

  // ゲーム開始
  startGame: () => {
    const { addLog } = get();
    const initialTopic = pickRandomTopic();
    set({
      phase: GamePhase.DISCUSSION,
      currentTurnIndex: 0,
      playCountConsumed: false,
      roundTopic: initialTopic,
    });
    addLog(LogType.MASTER, MASTER_LINES.GAME_START(1, initialTopic), MASTER_CHARACTER.id);
  },

  // ログ追加
  addLog: (type: LogType, content: string, agentId?: string, extra?: {
    thought?: string;
    speech?: string;
    thoughtExpression?: Expression;
    speechExpression?: Expression;
    isStreaming?: boolean;
    rawStreamText?: string;
  }) => {
    const logId = generateLogId();
    const newLog: LogEntry = {
      id: logId,
      type,
      content,
      agentId,
      thought: extra?.thought,
      speech: extra?.speech,
      thoughtExpression: extra?.thoughtExpression,
      speechExpression: extra?.speechExpression,
      timestamp: Date.now(),
      isStreaming: extra?.isStreaming,
      rawStreamText: extra?.rawStreamText,
    };
    set((state) => ({ logs: [...state.logs, newLog] }));
    return logId;
  },

  // ストリームテキストを更新
  updateLogStream: (logId: string, rawStreamText: string) => {
    set((state) => ({
      logs: state.logs.map((log) => {
        if (log.id === logId) {
          const parsed = parseStreamResponse(rawStreamText);
          return {
            ...log,
            rawStreamText,
            thought: parsed.internal_thought,
            speech: parsed.external_speech,
            thoughtExpression: parsed.internal_expression,
            speechExpression: parsed.external_expression,
          };
        }
        return log;
      }),
    }));
  },

  // ストリーム完了
  finalizeLogStream: (logId: string) => {
    set((state) => ({
      logs: state.logs.map((log) => {
        if (log.id === logId) {
          return { ...log, isStreaming: false };
        }
        return log;
      }),
    }));
  },

  // 最後のログを削除（介入時の先読みログ削除用）
  removeLastLog: () => {
    set((state) => {
      if (state.logs.length === 0) return state;
      const removedLog = state.logs[state.logs.length - 1];
      return {
        logs: state.logs.slice(0, -1),
        // 先読みログを削除した場合、currentTurnIndexも戻す
        currentTurnIndex: removedLog.type === LogType.AGENT_TURN
          ? Math.max(0, state.currentTurnIndex - 1)
          : state.currentTurnIndex,
      };
    });
  },

  // エージェントの発話状態を更新
  setAgentSpeaking: (agentId: string, isSpeaking: boolean) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, isSpeaking } : a
      ),
    }));
  },

  // エージェントの表情を更新
  setAgentExpression: (agentId: string, expression: Expression) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, currentExpression: expression } : a
      ),
    }));
  },

  // エージェントの口パク状態を更新
  setAgentMouthOpen: (agentId: string, mouthOpen: boolean) => {
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === agentId ? { ...a, mouthOpen } : a
      ),
    }));
  },

  // 議論ターンの処理（ストリーミング対応、キャンセル可能）
  processDiscussionTurn: async (signal?: AbortSignal) => {
    const {
      agents,
      logs,
      currentTurnIndex,
      addLog,
      updateLogStream,
      finalizeLogStream,
      phase,
      setAgentSpeaking,
      shuffleAgents,
      gameSessionId,
    } = get();

    if (phase !== GamePhase.DISCUSSION) return;

    const aliveAgents = agents.filter((a) => a.isAlive);
    const turnsPerRound = gameConfig.getValue('turnsPerRound');
    const totalTurns = aliveAgents.length * turnsPerRound;

    // 全員が指定回数発言完了 -> 自動遷移しない、フラグを立てるだけ
    if (currentTurnIndex >= totalTurns) {
      set({ discussionComplete: true, isProcessing: false });
      return;
    }

    // ターン周回時（全員1回発言完了後）:
    // 司会アナウンスを先に表示し、次話者の生成は次タップまで待つ（先読みしない）
    if (currentTurnIndex > 0 && currentTurnIndex % aliveAgents.length === 0) {
      const expectedTurnInRound = Math.floor(currentTurnIndex / aliveAgents.length) + 1;
      const { currentTurnInRound } = get();

      // まだこのターン開始アナウンスを出していない場合のみ実行
      if (currentTurnInRound < expectedTurnInRound) {
        set({ currentTurnInRound: expectedTurnInRound, discussionBatchQueue: [] });
        addLog(LogType.MASTER, MASTER_LINES.NEXT_TURN(expectedTurnInRound), MASTER_CHARACTER.id);
        shuffleAgents();
        set({ isProcessing: false });
        return;
      }
    }

    // ================================================================
    // 議論バッチ
    // ================================================================
    {
      const { discussionBatchQueue, generationEpoch } = get();

      if (discussionBatchQueue.length > 0) {
        // キューから取り出し
        const [item, ...remainingQueue] = discussionBatchQueue;
        const currentAgents = get().agents.filter((a) => a.isAlive);
        const agent = currentAgents.find((a) => a.id === item.agent_id);
        if (!agent) {
          set({ discussionBatchQueue: remainingQueue, isProcessing: false });
          return;
        }

        const rawText = `[${item.thought_expression}]${item.thought}|||[${item.speech_expression}]${item.speech}`;
        const parsed = parseStreamResponse(rawText);
        const logId = addLog(LogType.AGENT_TURN, '', agent.id, {
          thought: parsed.internal_thought,
          speech: parsed.external_speech,
          thoughtExpression: parsed.internal_expression,
          speechExpression: parsed.external_expression,
          isStreaming: false,
          rawStreamText: rawText,
        });

        const nextTurnIndex = currentTurnIndex + 1;
        const isDiscussionComplete = nextTurnIndex >= totalTurns;

        set((state) => ({
          discussionBatchQueue: remainingQueue,
          currentTurnIndex: nextTurnIndex,
          isProcessing: false,
          isAnimating: true,
          currentAnimatingLogId: logId,
          discussionComplete: isDiscussionComplete ? true : state.discussionComplete,
        }));
        return;
      }

      // キュー空 → APIフェッチ
      set({ isProcessing: true });

      const currentAgents = get().agents.filter((a) => a.isAlive);
      const startSpeakerIndex = currentTurnIndex % currentAgents.length;
      const firstSpeaker = currentAgents[startSpeakerIndex];
      const recentLogs = logs.slice(-RECENT_LOGS_LIMIT_FOR_AI);
      const { round, currentTurnInRound } = get();

      // プレースホルダーログを先に作成（考え中の顔表示用、SSEパスと同じ）
      const placeholderLogId = firstSpeaker
        ? addLog(LogType.AGENT_TURN, '', firstSpeaker.id, {
            thought: '',
            speech: '',
            thoughtExpression: 'default',
            speechExpression: 'default',
            isStreaming: true,
            rawStreamText: '',
          })
        : '';

      if (firstSpeaker) {
        setAgentSpeaking(firstSpeaker.id, true);
      }

      // プレースホルダーログを除去するヘルパー（無言停止を防ぐ）
      const removePlaceholder = () => {
        if (placeholderLogId) {
          set((state) => ({
            logs: state.logs.filter((l) => l.id !== placeholderLogId),
          }));
        }
      };

      try {
        if (signal?.aborted) {
          removePlaceholder();
          if (firstSpeaker) setAgentSpeaking(firstSpeaker.id, false);
          set({ isProcessing: false });
          return;
        }

        const { isByok, byokApiKey } = get();

        if (isByok && byokApiKey) {
          // BYOK: 個別生成モード（byokGameFlowに委譲）
          // placeholder は byokGameFlow 側で管理するため、ここで作った placeholder を削除
          removePlaceholder();
          if (firstSpeaker) setAgentSpeaking(firstSpeaker.id, false);
          const { byokProcessDiscussionTurn } = await import('./byokGameFlow');
          await byokProcessDiscussionTurn(get, set, signal);
          return;
        } else {
          // APIキー未設定
          removePlaceholder();
          if (firstSpeaker) setAgentSpeaking(firstSpeaker.id, false);
          set({ isProcessing: false });
          return;
        }

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          removePlaceholder();
          if (firstSpeaker) setAgentSpeaking(firstSpeaker.id, false);
          set({ isProcessing: false });
          return;
        }

        // フォールバック: プレースホルダーログをエラー内容で更新
        if (firstSpeaker) setAgentSpeaking(firstSpeaker.id, false);
        const errorRawText = '[default]処理エラー...|||[default]...';
        if (placeholderLogId) {
          updateLogStream(placeholderLogId, errorRawText);
          finalizeLogStream(placeholderLogId);
        }

        const nextTurnIndex = currentTurnIndex + 1;
        const isDiscussionComplete = nextTurnIndex >= totalTurns;

        set((state) => ({
          currentTurnIndex: nextTurnIndex,
          isProcessing: false,
          isAnimating: true,
          currentAnimatingLogId: placeholderLogId || null,
          discussionComplete: isDiscussionComplete ? true : state.discussionComplete,
        }));
      }
    }
  },

  // 投票を並列で先に取得（advanceToVoting時に呼ばれる）
  fetchAllVotesParallel: async () => {
    const { agents, logs, roundTopic } = get();
    const aliveAgents = agents.filter((a) => a.isAlive);
    const { isByok: isByokVote } = get();
    const recentLogs = logs.slice(isByokVote ? -15 : -RECENT_LOGS_LIMIT_FOR_AI);
    const leftmostAlive = aliveAgents[0];

    set({ isProcessing: true, votingFetchComplete: false, cachedVoteResults: [] });

    try {
      if (!leftmostAlive) {
        set({
          cachedVoteResults: [],
          voteTallies: {},
          votingFetchComplete: true,
          isProcessing: false,
        });
        return;
      }

      const getFallbackTargetForVoter = (voter: Agent): Agent => {
        const other = aliveAgents.find((a) => a.id !== voter.id);
        return other || leftmostAlive;
      };
      const candidates = aliveAgents;

      const buildFallbackResult = (voter: Agent): CachedVoteResult => {
        const fallbackTarget = getFallbackTargetForVoter(voter);
        return {
          voterId: voter.id,
          voterName: voter.name,
          targetId: fallbackTarget.id,
          targetName: fallbackTarget.name,
        };
      };

      let results: CachedVoteResult[] = [];

      const { isByok, byokApiKey } = get();

      if (isByok && byokApiKey) {
        // BYOK: クライアントサイドで投票バッチを直接呼び出す
        const { byokVoteBatch } = await import('./byokClient');
        const data = await byokVoteBatch({
          voters: aliveAgents,
          candidates,
          allAgents: agents,
          recentLogs,
          promptContext: {
            gmInstructions: '',
            specialRules: ['自分自身には投票しないこと'],
            agentModifiers: {},
            roundContext: `現在のお題: ${roundTopic}`,
          },
          onError: (msg: string) => get().setByokError(msg),
        }, byokApiKey);

        const voteMap = new Map(
          (Array.isArray(data.votes) ? data.votes : []).map((vote) => [vote.voter_id, vote])
        );

        results = aliveAgents.map((voter) => {
          const vote = voteMap.get(voter.id);
          const validTarget = candidates.find(
            (candidate) => candidate.id === vote?.vote_target_id && candidate.id !== voter.id
          );
          const fallbackTarget = getFallbackTargetForVoter(voter);
          const targetId = validTarget ? validTarget.id : fallbackTarget.id;
          const target = agents.find((agent) => agent.id === targetId);
          return {
            voterId: voter.id,
            voterName: voter.name,
            targetId,
            targetName: target?.name || fallbackTarget.name,
          };
        });
      } else {
        // APIキー未設定: フォールバック
        results = aliveAgents.map((voter) => buildFallbackResult(voter));
      }

      // 投票集計を計算（ユーザー票を含める）
      const { userVote } = get();
      const tallies: Record<string, number> = {};

      // エージェント投票を集計
      results.forEach((result) => {
        tallies[result.targetId] = (tallies[result.targetId] || 0) + 1;
      });

      // ユーザー投票を加算
      if (userVote && userVote.type !== 'watch' && userVote.targetId) {
        tallies[userVote.targetId] = (tallies[userVote.targetId] || 0) + 1;
      }

      set({
        cachedVoteResults: results,
        voteTallies: tallies,
        votingFetchComplete: true,
        isProcessing: false,
      });
    } catch (error) {
      const fallbackResults = aliveAgents.map((voter) => ({
        voterId: voter.id,
        voterName: voter.name,
        targetId: aliveAgents.find((a) => a.id !== voter.id)?.id || leftmostAlive?.id || voter.id,
        targetName: aliveAgents.find((a) => a.id !== voter.id)?.name || leftmostAlive?.name || voter.name,
      }));
      const fallbackTallies: Record<string, number> = {};
      fallbackResults.forEach((result) => {
        fallbackTallies[result.targetId] = (fallbackTallies[result.targetId] || 0) + 1;
      });

      const { userVote } = get();
      if (userVote && userVote.type !== 'watch' && userVote.targetId) {
        fallbackTallies[userVote.targetId] = (fallbackTallies[userVote.targetId] || 0) + 1;
      }

      set({
        isProcessing: false,
        votingFetchComplete: true,
        cachedVoteResults: fallbackResults,
        voteTallies: fallbackTallies,
      });
    }
  },

  // 次の投票ログを表示（キャッシュから）。全員表示完了時はtrueを返す
  showNextVoteLog: (): boolean => {
    const { cachedVoteResults, currentVoteIndex, addLog, recordVote, clearVoteResults } = get();

    // 投票開始時（最初の投票者）のみクリア
    if (currentVoteIndex === 0) {
      clearVoteResults();
    }

    // 全員表示完了 -> GM投票公開フェーズへ
    if (currentVoteIndex >= cachedVoteResults.length) {
      return true; // 全員表示完了
    }

    const result = cachedVoteResults[currentVoteIndex];

    // 投票情報を記録（UI表示用）
    recordVote(result.voterId, result.targetId);

    // ログを追加
    addLog(
      LogType.MASTER,
      MASTER_LINES.VOTE_ANNOUNCE(result.voterName, result.targetName),
      MASTER_CHARACTER.id
    );

    set({ currentVoteIndex: currentVoteIndex + 1 });
    return false; // まだ続きあり
  },

  // ユーザー投票をセット
  setUserVote: (vote: UserVote) => {
    const { round, agents, gameStats } = get();

    // 対象名を取得
    const targetName = vote.targetId
      ? agents.find((a) => a.id === vote.targetId)?.name || null
      : null;

    // ゲーム統計を更新
    const newStats = { ...gameStats };
    if (vote.type === 'one_vote') {
      newStats.oneVoteCount++;
    } else {
      newStats.watchCount++;
    }

    // 投票履歴を追加（resultedInEliminationは後でapplyVotingResultで更新）
    const historyEntry: UserVoteHistory = {
      round,
      vote,
      targetName,
      resultedInElimination: false,
    };
    newStats.userVoteHistory = [...newStats.userVoteHistory, historyEntry];

    // userVoteをセット
    // 投票集計はfetchAllVotesParallel完了時に統合される
    // UIState遷移はpage.tsx側で行う
    set({
      userVote: vote,
      gameStats: newStats,
    });
  },

  // GM投票を公開（ログ追加のみ、voteResultsはpage.tsx側でアニメーション前に更新済み）
  showGmVoteLog: () => {
    const { userVote, agents, addLog } = get();

    if (!userVote) {
      set({ votingComplete: true });
      return;
    }

    // GM投票ログを追加
    if (userVote.type === 'watch') {
      addLog(LogType.MASTER, MASTER_LINES.GM_VOTE_WATCH(), MASTER_CHARACTER.id);
    } else if (userVote.targetId) {
      const target = agents.find((a) => a.id === userVote.targetId);
      const targetName = target?.name || 'UNKNOWN';

      addLog(LogType.MASTER, MASTER_LINES.GM_VOTE_ONE(targetName), MASTER_CHARACTER.id);
    }

    set({ votingComplete: true });
  },

  // 投票結果適用（退場者を特定してキューに入れ、司会ログを追加）
  // 注意: この時点ではisAliveは変更しない（断末魔演出後に変更）
  applyVotingResult: (): { eliminated: string[]; penalized: string[] } => {
    const { agents, voteTallies, addLog, userVote, gameStats, round } = get();
    const aliveAgents = agents.filter((a) => a.isAlive);
    const eliminated: string[] = [];
    const penalized: string[] = [];
    const eliminationQueue: EliminationQueueItem[] = [];

    if (aliveAgents.length === 0) {
      set({ phase: GamePhase.RESOLUTION, isProcessing: false });
      return { eliminated, penalized };
    }

    // 生存者全員の得票を0埋めして最下位/トップ判定
    const scores: Record<string, number> = {};
    aliveAgents.forEach((agent) => {
      scores[agent.id] = voteTallies[agent.id] || 0;
    });

    let maxVotes = Number.MIN_SAFE_INTEGER;
    let minVotes = Number.MAX_SAFE_INTEGER;
    Object.values(scores).forEach((count) => {
      if (count > maxVotes) maxVotes = count;
      if (count < minVotes) minVotes = count;
    });

    const topIds = aliveAgents.filter((a) => scores[a.id] === maxVotes).map((a) => a.id);
    const bottomIds = aliveAgents.filter((a) => scores[a.id] === minVotes).map((a) => a.id);

    if (topIds.length > 0) {
      const topNames = topIds.map((id) => agents.find((a) => a.id === id)?.name || 'UNKNOWN');
      addLog(LogType.MASTER, MASTER_LINES.ROUND_TOP(topNames), MASTER_CHARACTER.id);
    }
    if (bottomIds.length > 0) {
      const bottomNames = bottomIds.map((id) => agents.find((a) => a.id === id)?.name || 'UNKNOWN');
      addLog(LogType.MASTER, MASTER_LINES.ROUND_BOTTOM(bottomNames), MASTER_CHARACTER.id);
    }

    // 最下位全員の舞台持ち時間を-1。0以下で退場キューへ。
    const stageTimeNextById: Record<string, number> = {};
    bottomIds.forEach((id) => {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;
      const nextStageTime = Math.max(0, agent.stageTime - 1);
      stageTimeNextById[id] = nextStageTime;
      penalized.push(id);
      addLog(
        LogType.MASTER,
        MASTER_LINES.STAGE_TIME_DOWN(agent.name, nextStageTime),
        MASTER_CHARACTER.id
      );
      if (nextStageTime === 0) {
        eliminated.push(id);
        eliminationQueue.push({
          agentId: agent.id,
          agentName: agent.name,
          characterId: agent.characterId,
        });
      }
    });

    if (eliminationQueue.length > 1) {
      addLog(
        LogType.MASTER,
        MASTER_LINES.TIE_ELIMINATION(eliminationQueue.map((item) => item.agentName)),
        MASTER_CHARACTER.id
      );
    } else if (eliminationQueue.length === 1) {
      addLog(LogType.MASTER, MASTER_LINES.ELIMINATION(eliminationQueue[0].agentName), MASTER_CHARACTER.id);
    }

    const updatedStats = { ...gameStats };
    if (userVote && userVote.targetId && eliminated.includes(userVote.targetId)) {
      updatedStats.userVoteHistory = updatedStats.userVoteHistory.map((h) =>
        h.round === round ? { ...h, resultedInElimination: true } : h
      );
    }
    updatedStats.totalRounds = round;
    updatedStats.lastEliminationCount = eliminationQueue.length;

    set((state) => ({
      agents: state.agents.map((a) => {
        if (!a.isAlive) return a;
        const nextStageTime = stageTimeNextById[a.id] ?? a.stageTime;
        if (eliminated.includes(a.id)) {
          return {
            ...a,
            stageTime: nextStageTime,
            status: 'pressured',
            currentExpression: 'painful' as Expression,
          };
        }
        if (bottomIds.includes(a.id)) {
          return {
            ...a,
            stageTime: nextStageTime,
            status: nextStageTime <= PRESSURED_STAGE_TIME ? 'pressured' : 'normal',
            currentExpression: 'painful' as Expression,
          };
        }
        return {
          ...a,
          status: a.stageTime <= PRESSURED_STAGE_TIME ? 'pressured' : 'normal',
        };
      }),
      phase: GamePhase.RESOLUTION,
      isProcessing: false,
      eliminationQueue,
      currentEliminationIndex: 0,
      eliminationReactionsFetched: false,
      gameStats: updatedStats,
    }));

    return { eliminated, penalized };
  },

  // 断末魔APIを並列取得
  fetchEliminationReactions: async () => {
    const { agents, logs, eliminationQueue, voteResults, userVote, gameSessionId } = get();

    if (eliminationQueue.length === 0) {
      set({ eliminationReactionsFetched: true });
      return;
    }


    try {
      // 全退場者の断末魔を並列でフェッチ
      const { isByok, byokApiKey } = get();
      const reactionPromises = eliminationQueue.map(async (item) => {
        const agent = agents.find((a) => a.id === item.agentId);
        if (!agent) return { agentId: item.agentId, reaction: 'なぜだ...' };

        // 自己投票かどうかを判定
        const voteInfo = voteResults[item.agentId];
        const selfVoted = voteInfo && voteInfo.votedFor === item.agentId;

        try {
          if (isByok && byokApiKey) {
            // BYOK: クライアントサイドで直接呼び出す
            const { byokEliminationReaction } = await import('./byokClient');
            const data = await byokEliminationReaction({
              agent,
              eliminatedAgents: eliminationQueue.map((e) => ({ id: e.agentId, name: e.agentName })),
              logs: logs.slice(-RECENT_LOGS_LIMIT_FOR_AI),
              allAgents: agents,
              selfVoted,
              gmVote: userVote ?? undefined,
              onError: (msg: string) => get().setByokError(msg),
            }, byokApiKey);
            return { agentId: item.agentId, reaction: data.reaction };
          }

          // APIキー未設定
          return { agentId: item.agentId, reaction: '……' };
        } catch {
          return { agentId: item.agentId, reaction: '……' };
        }
      });

      const results = await Promise.all(reactionPromises);

      // 結果をキューに反映
      set((state) => ({
        eliminationQueue: state.eliminationQueue.map((item) => {
          const result = results.find((r) => r.agentId === item.agentId);
          return result ? { ...item, reaction: result.reaction } : item;
        }),
        eliminationReactionsFetched: true,
      }));

    } catch (error) {
      // エラー時もフェッチ完了扱いにして進行を止めない
      set({ eliminationReactionsFetched: true });
    }
  },

  // 次の断末魔を表示
  showNextEliminationReaction: () => {
    const { eliminationQueue, currentEliminationIndex, addLog } = get();

    if (currentEliminationIndex >= eliminationQueue.length) {
      // 全員の断末魔表示完了
      return;
    }

    const item = eliminationQueue[currentEliminationIndex];
    const reaction = item.reaction || 'なぜだ...';

    // 断末魔ログを追加
    addLog(LogType.ELIMINATION_REACTION, reaction, item.agentId);

    set({ currentEliminationIndex: currentEliminationIndex + 1 });
  },

  // 退場を確定（isAlive=false, fainted）
  // 退場演出開始（fainted画像表示、音再生開始）
  startElimination: (agentId: string) => {
    const { agents } = get();
    const agent = agents.find((a) => a.id === agentId);

    if (!agent) return;


    // 表情をfaintedに変更し、executingAgentIdをセット
    set((state) => ({
      agents: state.agents.map((a) => {
        if (a.id === agentId) {
          return {
            ...a,
            currentExpression: 'fainted' as Expression,
          };
        }
        return a;
      }),
      executingAgentId: agentId,
    }));
  },

  // 退場完了（isAlive=false、DELETEDログ）
  finishElimination: (agentId: string) => {
    const { agents, addLog, round } = get();
    const agent = agents.find((a) => a.id === agentId);

    if (!agent) return;


    // isAlive=falseに変更
    set((state) => ({
      agents: state.agents.map((a) => {
        if (a.id === agentId) {
          return {
            ...a,
            isAlive: false,
            status: 'eliminated',
            eliminationRound: round,
          };
        }
        return a;
      }),
      executingAgentId: null,
    }));

    // 「◯◯は……削除された。」ログを追加
    addLog(LogType.MASTER, MASTER_LINES.ELIMINATED(agent.name), MASTER_CHARACTER.id);
  },

  // 退場を確定（後方互換：startElimination + finishEliminationを一度に実行）
  confirmElimination: (agentId: string) => {
    const { agents, addLog, round } = get();
    const agent = agents.find((a) => a.id === agentId);

    if (!agent) return;


    // isAlive=false, expression='fainted'に変更
    set((state) => ({
      agents: state.agents.map((a) => {
        if (a.id === agentId) {
          return {
            ...a,
            isAlive: false,
            status: 'eliminated',
            eliminationRound: round,
            currentExpression: 'fainted' as Expression,
          };
        }
        return a;
      }),
    }));

    // 「◯◯は……削除された。」ログを追加
    addLog(LogType.MASTER, MASTER_LINES.ELIMINATED(agent.name), MASTER_CHARACTER.id);
  },

  // エージェントの順番をシャッフル
  shuffleAgents: () => {
    set((state) => ({
      agents: shuffleArray(state.agents),
    }));
  },

  // メンバー選定画面用：10人のプールから再度5人を選出
  shuffleSelectedAgents: () => {
    set({ agents: createAgents() });
  },

  // 次のラウンドへ
  nextRound: () => {
    const { agents, round, addLog, shuffleAgents } = get();
    const survivors = agents.filter((a) => a.isAlive);

    if (survivors.length === 0) {
      // 全員退場（全員同票等）
      set({ phase: GamePhase.GAME_OVER });
      addLog(
        LogType.MASTER,
        MASTER_LINES.GAME_OVER_NO_SURVIVOR(),
        MASTER_CHARACTER.id
      );
    } else if (survivors.length === 1) {
      // 勝者決定
      // フェーズはまだGAME_OVERにしない（勝利演出のため）
      // ゲーム終了アナウンス
      addLog(
        LogType.MASTER,
        MASTER_LINES.GAME_OVER(survivors[0].name),
        MASTER_CHARACTER.id
      );
      // 勝者称賛
      addLog(
        LogType.MASTER,
        MASTER_LINES.WINNER_PRAISE(survivors[0].name),
        MASTER_CHARACTER.id
      );
      // 生存者システムメッセージを追加
      addLog(LogType.SYSTEM, `［生存者：${survivors[0].name}］`);
      // 勝者のhappy表情に変更
      set((state) => ({
        agents: state.agents.map((a) =>
          a.id === survivors[0].id
            ? { ...a, currentExpression: 'happy' as Expression }
            : a
        ),
        // 勝利演出待ち状態：winnerIds をセット（1人）
        winnerIds: [survivors[0].id],
        victoryCommentsFetched: {},
        currentVictoryIndex: 0,
      }));
      // GAME_OVERフェーズへ（page.tsxで勝利コメントを取得・表示）
      set({ phase: GamePhase.GAME_OVER });
    } else {
      const newRound = round + 1;
      const nextTopic = pickRandomTopic();

      // ラウンド開始時に順番をシャッフル
      shuffleAgents();
      set({
        round: newRound,
        roundTopic: nextTopic,
        currentTurnInRound: 1,
        phase: GamePhase.DISCUSSION,
        currentTurnIndex: 0,
        currentVoteIndex: 0,
        voteTallies: {},
        discussionComplete: false,
        votingComplete: false,
      });
      addLog(LogType.SYSTEM, '--------------------------------');
      addLog(LogType.MASTER, MASTER_LINES.NEXT_ROUND(newRound, nextTopic), MASTER_CHARACTER.id);
    }
  },

  // 強制終了（デバッグ用）
  endGame: () => {
    const { addLog } = get();
    set({ phase: GamePhase.GAME_OVER });
    addLog(LogType.MASTER, 'デバッグモード: 1ラウンド終了', MASTER_CHARACTER.id);
  },

  // ゲームリセット
  resetGame: () => {
    // タイマーをリセット
    timerRegistry.cancelAll();

    // BYOK: sessionStorage のキーは残す（30分TTLで自動失効）
    // Zustand state のみリセットし、次ゲーム開始時に sessionStorage から復元する

    set({
      gameSessionId: generateGameSessionId(),
      playCountConsumed: false,
      phase: GamePhase.IDLE,
      round: 1,
      roundTopic: '',
      currentTurnInRound: 1,
      agents: createAgents(),
      logs: [],
      currentTurnIndex: 0,
      currentVoteIndex: 0,
      voteTallies: {},
      isProcessing: false,
      isAnimating: false,
      currentAnimatingLogId: null,
      voteResults: {},
      discussionComplete: false,
      votingComplete: false,
      cachedVoteResults: [],
      votingFetchComplete: false,
      userVote: null,
      eliminationQueue: [],
      currentEliminationIndex: 0,
      eliminationReactionsFetched: false,
      executingAgentId: null,
      winnerIds: [],
      victoryCommentsFetched: {},
      currentVictoryIndex: 0,
      currentAbortController: null,
      discussionBatchQueue: [],
      generationEpoch: 0,
      // BYOK リセット
      isByok: true,
      byokApiKey: null,
      byokGmInstruction: null,
      byokError: null,
      uiState: INITIAL_UI_STATE,
      gameStats: {
        totalRounds: 0,
        userVoteHistory: [],
        forceEliminateCount: 0,
        oneVoteCount: 0,
        watchCount: 0,
        interventionCount: 0,
        lastEliminationCount: 0,
        selfSacrificeCount: 0,
      },
    });
  },

  // 投票記録
  recordVote: (voterId: string, targetId: string) => {
    set((state) => {
      const newResults = { ...state.voteResults };

      // 投票者の情報を更新
      if (!newResults[voterId]) {
        newResults[voterId] = { receivedVotes: 0 };
      }
      newResults[voterId].votedFor = targetId;

      // 投票先の受けた票数を更新
      if (!newResults[targetId]) {
        newResults[targetId] = { receivedVotes: 0 };
      }
      newResults[targetId].receivedVotes += 1;

      return { voteResults: newResults };
    });
  },

  // 投票結果クリア
  clearVoteResults: () => {
    set({ voteResults: {} });
  },

  // アニメーション完了通知
  setAnimationComplete: (logId: string) => {
    const { currentAnimatingLogId } = get();
    if (currentAnimatingLogId === logId) {
      set({ isAnimating: false, currentAnimatingLogId: null });
    }
  },

  // ============================================
  // 疎結合: 明示的なフェーズ遷移アクション
  // ============================================

  // 議論フェーズから投票フェーズへ明示的に遷移
  advanceToVoting: () => {
    const { addLog, discussionComplete, clearVoteResults } = get();

    if (!discussionComplete) {
      return;
    }


    // 前回の投票結果をクリア（2回目投票時に一瞬見える問題を修正）
    clearVoteResults();

    set({
      phase: GamePhase.VOTING,
      currentVoteIndex: 0,
      voteTallies: {},
      cachedVoteResults: [],
      votingFetchComplete: false,
      discussionComplete: false,
      isProcessing: false,
      userVote: null,
    });
    addLog(LogType.MASTER, MASTER_LINES.VOTE_START, MASTER_CHARACTER.id);

    // UIState遷移はpage.tsx側で制御
  },

  // 投票フェーズから結果適用フェーズへ明示的に遷移
  advanceToResolution: () => {
    const { votingComplete, applyVotingResult, fetchEliminationReactions } = get();

    if (!votingComplete) {
      return;
    }

    set({ votingComplete: false });
    const result = applyVotingResult();

    // 2人生き残りエンドの場合はGAME_OVERに遷移済みなので断末魔処理をスキップ
    if (result.eliminated.length === 0) {
      return;
    }

    // 司会の退場発表ログ表示中に断末魔APIを先読み開始
    // UI側でannouncingフェーズの表示が終わるまでに取得を完了させる
    fetchEliminationReactions();
  },

  // 結果適用フェーズから次のラウンドへ明示的に遷移
  advanceToNextRound: () => {
    const { phase, nextRound } = get();

    if (phase !== GamePhase.RESOLUTION) {
      return;
    }

    // 脱落演出のタイマーをキャンセル
    timerRegistry.cancelByPattern(/^elimination/);
    nextRound();
  },

  // 現在の操作をキャンセル
  cancelCurrentOperation: () => {
    const { currentAbortController } = get();


    // AbortControllerでAPIリクエストをキャンセル
    if (currentAbortController) {
      currentAbortController.abort();
    }

    // すべてのタイマーをキャンセル
    timerRegistry.cancelAll();

    set({
      isProcessing: false,
      currentAbortController: null,
    });
  },
}));
