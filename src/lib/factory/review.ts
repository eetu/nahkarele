/** The Finnish school scale, 4 to 10, in words. */
export const GRADE_WORD: Record<number, string> = {
  4: "fail",
  5: "passable",
  6: "fair",
  7: "satisfactory",
  8: "good",
  9: "commendable",
  10: "excellent",
};

const REMARK: Record<number, string> = {
  4: "TÄ'h corrected most of your work. please see me about your attitude.",
  5: "room for improvement. TÄ'h has none.",
  6: "adequate. the boots would have been the same without you, but less adequately.",
  7: "satisfactory. keep stamping.",
  8: "good work. TÄ'h agreed with you most of the time, which it did not need to.",
  9: "excellent. you are almost as accurate as the machine that checks you.",
  10: "flawless. you and TÄ'h made identical decisions. only one of you is paid.",
};

export const remark = (grade: number): string => REMARK[grade] ?? REMARK[4];
