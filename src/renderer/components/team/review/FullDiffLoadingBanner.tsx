import React from 'react';

import { Clock3, FileDiff, LoaderCircle, Sparkles } from 'lucide-react';

interface FullDiffLoadingBannerProps {
  loadingFilesCount: number;
  snippetCount: number;
  activeFileName?: string;
}

export const FullDiffLoadingBanner = ({
  loadingFilesCount,
  snippetCount,
  activeFileName,
}: FullDiffLoadingBannerProps): React.ReactElement => {
  const title =
    loadingFilesCount === 1 ? 'Preparing Full Diff' : `Preparing ${loadingFilesCount} Full Diffs`;
  const subtitle =
    loadingFilesCount === 1
      ? activeFileName
        ? `Finalizing the exact editor diff for ${activeFileName}.`
        : 'Finalizing the exact editor diff for the current file.'
      : 'Resolving exact before/after baselines for the files currently loading.';

  return (
    <div className="bg-surface/95 border-b border-border px-4 py-3">
      <div className="bg-surface-raised/80 rounded-xl border border-border shadow-sm">
        <div className="flex items-start gap-3 px-3 py-3">
          <div className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-sidebar">
            <div className="absolute inset-1 rounded-lg bg-emerald-500/10 blur-sm" />
            <LoaderCircle
              className="relative size-4 animate-spin text-emerald-400"
              strokeWidth={1.8}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-300">
                <Sparkles className="size-3" strokeWidth={1.8} />
                {title}
              </span>
              {activeFileName ? (
                <span className="truncate text-sm font-medium text-text">{activeFileName}</span>
              ) : null}
            </div>

            <p className="mt-1 text-xs leading-5 text-text-secondary">{subtitle}</p>

            <div className="mt-2 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sidebar px-2 py-1 text-[11px] text-text-secondary">
                <FileDiff className="size-3.5" strokeWidth={1.8} />
                {snippetCount} snippet{snippetCount === 1 ? '' : 's'} ready
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sidebar px-2 py-1 text-[11px] text-text-secondary">
                <Clock3 className="size-3.5" strokeWidth={1.8} />
                Editor view loading
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sidebar px-2 py-1 text-[11px] text-text-secondary">
                <FileDiff className="size-3.5" strokeWidth={1.8} />
                {loadingFilesCount} file{loadingFilesCount === 1 ? '' : 's'} in progress
              </span>
            </div>
          </div>
        </div>

        <div className="px-3 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sidebar">
            <div
              className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400/20 via-emerald-300/80 to-emerald-400/20"
              style={{ animation: 'full-diff-loader-slide 1.6s ease-in-out infinite' }}
            />
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            Snippet previews stay visible below while the exact baselines are reconstructed.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes full-diff-loader-slide {
          0% { transform: translateX(-110%); }
          50% { transform: translateX(110%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
};
