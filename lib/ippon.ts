import { Agent } from './types';

type CommentTier = 'hit' | 'close' | 'weak' | 'crash';

const COMMENT_BANK: Record<string, Record<CommentTier, string[]>> = {
  粗野: {
    hit: ['粗野「短く刺したな。文句なし」', '粗野「それだよ。今のは強い」'],
    close: ['粗野「今のは惜しい、あと半歩だ」', '粗野「芯はある。切れ味だけ足りん」'],
    weak: ['粗野「薄いな」', '粗野「説明で逃げるな」'],
    crash: ['粗野「事故ってるな」', '粗野「着地どこ行った」'],
  },
  黒沼: {
    hit: ['黒沼「いいですね。嫌な映像が見えた」', '黒沼「空気を持っていきましたね」'],
    close: ['黒沼「嫌いじゃない。刺し切れなかっただけ」', '黒沼「輪郭はある。毒がまだ薄い」'],
    weak: ['黒沼「まだ人間でしたね」', '黒沼「安全運転すぎる」'],
    crash: ['黒沼「今のは凍ったね」', '黒沼「悪夢にもならない」'],
  },
  理坂: {
    hit: ['理坂「構造がきれいだ。一本」', '理坂「語順の落差が効いている」'],
    close: ['理坂「構図は良い。結論だけもう一段」', '理坂「視点はある。出口が弱い」'],
    weak: ['理坂「視点はあるけど、出口が弱い」', '理坂「情報が多く、笑いが散った」'],
    crash: ['理坂「論点が行方不明だ」', '理坂「前提が崩れて意味が死んだ」'],
  },
  ふに岡: {
    hit: ['ふに岡「え、好き。いまの笑った」', 'ふに岡「変なのに、ちゃんと面白い」'],
    close: ['ふに岡「今の、ちょっと好きだった」', 'ふに岡「もう少しでドカンだった」'],
    weak: ['ふに岡「いまの、ちょっとかわいそう」', 'ふに岡「うーん、置きにいったかも」'],
    crash: ['ふに岡「えっ、いま何が起きた？」', 'ふに岡「迷子になってるね」'],
  },
  韻寺ライム: {
    hit: ['韻寺ライム「言葉が立った、一本！」', '韻寺ライム「語感まで決まってる」'],
    close: ['韻寺ライム「響きは来た、決め切りが足りん」', '韻寺ライム「あと1語でハネた」'],
    weak: ['韻寺ライム「韻でも救えないやつ来た」', '韻寺ライム「語感はある、芯がない」'],
    crash: ['韻寺ライム「韻も意味も迷子だ」', '韻寺ライム「リズムだけ先に死んだ」'],
  },
};

const DEFAULT_COMMENTS: Record<CommentTier, string[]> = {
  hit: ['観客「今のは強い」'],
  close: ['観客「惜しい、もう一段」'],
  weak: ['観客「薄い」'],
  crash: ['観客「事故」'],
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const pickComment = (name: string, tier: CommentTier): string => {
  const pool = COMMENT_BANK[name]?.[tier] ?? DEFAULT_COMMENTS[tier];
  return pool[Math.floor(Math.random() * pool.length)];
};

interface AnswerAxes {
  clarity: number;
  surprise: number;
  imagery: number;
  brevity: number;
  character: number;
  gayaSeed: number;
}

const evalAnswerAxes = (
  speaker: Agent,
  text: string,
  isDuplicate: boolean,
  recentSpeeches: string[],
): AnswerAxes => {
  const len = text.length;
  const clarity = len >= 10 && len <= 55 ? 4 : len <= 70 ? 3 : 1;
  const surprise = /まさか|突然|実は|初めて|だけ|しか|逆に|なのに/.test(text) ? 4 : 2 + Math.floor(Math.random() * 2);
  const imagery = /写真|寿司|コンビニ|学校|LINE|上司|地獄|宇宙|猫|犬|駅|レジ|会議/.test(text) ? 4 : 2;
  const brevity = len <= 42 ? 4 : len <= 60 ? 3 : 1;
  const character = /俺|私|僕|ぼく|オレ/.test(text) ? 4 : 2;
  const gayaSeed = recentSpeeches.some((v) => v.length > 0 && Math.abs(v.length - len) < 4) ? 2 : 4;

  return {
    clarity: isDuplicate ? 1 : clarity,
    surprise,
    imagery,
    brevity,
    character: speaker.name === '理坂' && /つまり|構造|前提/.test(text) ? 4 : character,
    gayaSeed,
  };
};

export interface IpponJudgeResult {
  awarded: boolean;
  laughDelta: number;
  announce: string;
}

export const judgeIppon = (
  speaker: Agent,
  speech: string,
  recentSpeeches: string[],
  currentIppon: number,
): IpponJudgeResult => {
  const text = speech.trim();
  if (!text) {
    return { awarded: false, laughDelta: -1, announce: pickComment(speaker.name, 'crash') };
  }

  const normalized = text.replace(/\s+/g, '');
  const isDuplicate = recentSpeeches.some((v) => v.replace(/\s+/g, '') === normalized);
  const len = text.length;
  if (len < 10 || len > 70) {
    return {
      awarded: false,
      laughDelta: -1,
      announce: pickComment(speaker.name, 'crash'),
    };
  }
  const axes = evalAnswerAxes(speaker, text, isDuplicate, recentSpeeches);
  const axisTotal = axes.clarity + axes.surprise + axes.imagery + axes.brevity + axes.character + axes.gayaSeed; // 6..24
  const score = clamp(Math.floor(axisTotal / 2.6) + (/[!?！？]/.test(text) ? 1 : 0), 0, 10);
  const probabilityGate = Math.random() < 0.16 / (1 + currentIppon * 1.2);
  const awarded = score >= 7 && probabilityGate;

  if (awarded) {
    return {
      awarded: true,
      laughDelta: 4 + Math.floor(Math.random() * 4),
      announce: `観客「IPPON！」 ${speaker.name}に1本。 ${pickComment(speaker.name, 'hit')}`,
    };
  }

  const tier: CommentTier = score >= 5 ? 'close' : score >= 3 ? 'weak' : 'crash';
  return {
    awarded: false,
    laughDelta: tier === 'close' ? 1 : tier === 'weak' ? 0 : -1,
    announce: pickComment(speaker.name, tier),
  };
};
