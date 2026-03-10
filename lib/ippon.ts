import { Agent } from './types';

const MISS_COMMENTS = [
  '粗野「薄いな」',
  '理坂「視点はあるけど、出口が弱い」',
  '黒沼「まだ人間でしたね」',
  'ふに岡「いまの、ちょっとかわいそう」',
  '韻寺ライム「韻でも救えないやつ来た」',
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

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
    return { awarded: false, laughDelta: -1, announce: MISS_COMMENTS[0] };
  }

  const normalized = text.replace(/\s+/g, '');
  const isDuplicate = recentSpeeches.some((v) => v.replace(/\s+/g, '') === normalized);
  const len = text.length;
  if (len < 10 || len > 70) {
    return {
      awarded: false,
      laughDelta: -1,
      announce: MISS_COMMENTS[Math.floor(Math.random() * MISS_COMMENTS.length)],
    };
  }
  const punctuationBonus = /[!?！？]/.test(text) ? 1 : 0;
  const uniqueBonus = isDuplicate ? -4 : 1;
  const compactBonus = len >= 12 && len <= 45 ? 1 : 0;
  const score = clamp(1 + punctuationBonus + uniqueBonus + compactBonus + Math.floor(Math.random() * 3), 0, 10);
  const probabilityGate = Math.random() < 0.22 / (1 + currentIppon * 0.9);
  const awarded = score >= 5 && probabilityGate;

  if (awarded) {
    return {
      awarded: true,
      laughDelta: 5 + Math.floor(Math.random() * 4),
      announce: `観客「IPPON！」 ${speaker.name}に1本。`,
    };
  }

  return {
    awarded: false,
    laughDelta: -1 + Math.floor(Math.random() * 3),
    announce: MISS_COMMENTS[Math.floor(Math.random() * MISS_COMMENTS.length)],
  };
};
