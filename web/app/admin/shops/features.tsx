"use client";

/** How a shop's features are shown: a row of dots in the list, a grid with the reason on the shop's own page. The rules live on the server (admin/shop-features.ts). */
export type FeatureState = 'working' | 'ready' | 'off' | 'setup' | 'problem';
export type Feature = { key: string; label: string; state: FeatureState; detail: string; required: boolean };
export type Coverage = { basics: { done: number; total: number }; extras: { on: number; total: number }; problems: number };

export const STATE_LABEL: Record<FeatureState, string> = { working: 'Working', ready: 'Ready', off: 'Off', setup: 'Needs setup', problem: 'Problem' };

export function FeatureDots({ features }: { features: Feature[] }) {
  return (
    <span className="fd-dots" role="list" aria-label="Features">
      {features.map((f) => (
        <span key={f.key} role="listitem" className={`fd-dot is-${f.state}`} title={`${f.label}: ${STATE_LABEL[f.state]}. ${f.detail}`} />
      ))}
    </span>
  );
}

export function Meter({ coverage }: { coverage: Coverage }) {
  return (
    <span className="fd-meter" title={`${coverage.basics.done} of ${coverage.basics.total} basics (payments, products, store info); ${coverage.extras.on} of ${coverage.extras.total} extras on`}>
      {coverage.basics.done}/{coverage.basics.total} basics
      <small>{coverage.extras.on}/{coverage.extras.total} extras{coverage.problems ? ` · ${coverage.problems} problem${coverage.problems === 1 ? '' : 's'}` : ''}</small>
    </span>
  );
}

export function Legend() {
  return (
    <div className="fd-legend" aria-hidden="true">
      {(['working', 'ready', 'setup', 'problem', 'off'] as FeatureState[]).map((s) => <span key={s}><i className={`fd-dot is-${s}`} />{STATE_LABEL[s]}</span>)}
    </div>
  );
}

export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="fd-grid">
      {features.map((f) => (
        <div key={f.key} className={`fd-item${f.state === 'problem' ? ' is-problem' : ''}`}>
          <div className="fd-item-head"><span>{f.label}{f.required ? <span className="fd-req">required</span> : null}</span><span className={`fd-state is-${f.state}`}>{STATE_LABEL[f.state]}</span></div>
          <p>{f.detail}</p>
        </div>
      ))}
    </div>
  );
}
