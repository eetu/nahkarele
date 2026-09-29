export type DiffLine = { id: number; mark: "+" | "-" | " "; text: string };

const WORDS = [
  "session",
  "config",
  "handler",
  "token",
  "retry",
  "cache",
  "payload",
  "schema",
  "adapter",
  "context",
  "result",
  "buffer",
  "agent",
  "prompt",
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

const CODE: ((a: string, b: string) => string)[] = [
  (a, b) => `const ${a} = await ${b}.resolve(${a}Options);`,
  (a, b) => `if (!${a}) throw new ${cap(b)}Error("${a} missing");`,
  (a, b) => `${a}.${b} = normalize${cap(b)}(${a}.${b} ?? defaults.${b});`,
  (a, b) => `return { ...${a}, ${b}: ${b}.map(to${cap(a)}) };`,
  (a) => `// TODO(ai): revisit ${a} handling`,
  (a, b) => `export const ${a}${cap(b)} = create${cap(b)}(${a});`,
  (a, b) => `for (const ${a} of ${b}s) yield* ${a}.stream();`,
  () => "}",
  () => "",
];

export type Diff = { files: number; lines: DiffLine[] };

/** A plausible, meaningless diff, sized to discourage reading it. */
export const fakeDiff = (rand: () => number = Math.random): Diff => {
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length) % xs.length];
  const n = 600 + Math.floor(rand() * 900);
  return {
    files: 3 + Math.floor(rand() * 40),
    lines: Array.from({ length: n }, (_, id) => {
      const r = rand();
      const mark = r < 0.4 ? "+" : r < 0.6 ? "-" : " ";
      const indent = "  ".repeat(Math.floor(rand() * 3));
      return { id, mark, text: indent + pick(CODE)(pick(WORDS), pick(WORDS)) };
    }),
  };
};
