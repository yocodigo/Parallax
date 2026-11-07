'use client';

import { useEffect, useId, useRef, useState } from 'react';
import DailyPlanForm from './DailyPlanForm';
import PlanForm from './PlanForm';
import ReviewForm from './ReviewForm';
import VoiceNote from './VoiceNote';

const TABS = [
  ['voice', 'Voice note'],
  ['daily', 'Daily plan'],
  ['plan', 'Log a plan'],
  ['review', 'Log a review'],
];

// The journal's entry forms, in a drawer opened from one button so the list
// comes first. The forms stay mounted while hidden, so a half-typed entry
// survives switching tabs or closing the drawer.
export default function NewEntry() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('voice');
  const button = useRef(null);
  const panel = useRef(null);
  const id = useId();

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    // The page behind shouldn't scroll under the drawer.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        New entry
      </button>

      {/* `hidden` sits on a wrapper with no display class: Tailwind's `flex` would override it. */}
      <div hidden={!open}>
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* Clicking outside closes; the drafts stay. */}
          <div aria-hidden="true" onClick={close} className="absolute inset-0 bg-black/40" />
          <div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            tabIndex={-1}
            className="relative flex h-full w-full max-w-2xl flex-col bg-gray-50 shadow-xl outline-none"
          >
            <div className="border-b border-gray-200 bg-white px-6 pt-5">
              <div className="flex items-center justify-between">
                <h2 id={`${id}-title`} className="text-lg font-semibold text-gray-900">
                  New entry
                </h2>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                >
                  Close
                </button>
              </div>
              <div role="tablist" aria-label="Kind of entry" className="mt-3 flex gap-1 overflow-x-auto">
                {TABS.map(([key, label]) => (
                  <button
                    key={key}
                    id={`${id}-tab-${key}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls={`${id}-panel-${key}`}
                    onClick={() => setTab(key)}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
                      tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {TABS.map(([key]) => (
                <div
                  key={key}
                  id={`${id}-panel-${key}`}
                  role="tabpanel"
                  aria-labelledby={`${id}-tab-${key}`}
                  hidden={tab !== key}
                >
                  {key === 'voice' && <VoiceNote />}
                  {key === 'daily' && <DailyPlanForm />}
                  {key === 'plan' && <PlanForm onSaved={close} />}
                  {key === 'review' && <ReviewForm onSaved={close} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
