interface CodePanelProps {
  code: string;
}

export function CodePanel({ code }: CodePanelProps) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-950 p-4 font-mono text-sm leading-relaxed text-green-400">
      <code>{code}</code>
    </pre>
  );
}