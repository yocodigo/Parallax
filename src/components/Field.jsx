// A labeled form control with its error message underneath. The error's id is
// `${id}-error`, so the control can point at it with aria-describedby.
export const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none aria-[invalid=true]:border-red-400';

export default function Field({ id, label, error, className = '', children }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
