const PALETTE = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-purple-600", "bg-slate-700"];

function toneFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function CompanyAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold text-white ${toneFor(name || "?")}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}
