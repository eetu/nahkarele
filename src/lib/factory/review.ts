/** Finnish school grades, 4 to 10. */
export const GRADE_WORD: Record<number, string> = {
  4: "hylätty",
  5: "välttävä",
  6: "kohtalainen",
  7: "tyydyttävä",
  8: "hyvä",
  9: "kiitettävä",
  10: "erinomainen",
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
