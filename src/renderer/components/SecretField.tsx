import { useState, type ReactElement } from 'react'

/** Write-only field: shows whether a value is stored, never the value itself. */
export function SecretField({ label, stored, placeholder, onSave }: { label: string; stored: boolean; placeholder: string; onSave: (value: string | null) => Promise<void> }): ReactElement {
  const [value, setValue] = useState('')
  return (
    <label className="field">
      <span className="fieldLabel">
        {label} <span className={`badge ${stored ? 'active' : ''}`}>{stored ? 'Saved' : 'Not saved'}</span>
      </span>
      <div className="inlineForm">
        <input type="password" value={value} placeholder={stored ? '••••••••' : placeholder} onChange={(event) => setValue(event.target.value)} spellCheck={false} autoComplete="off" />
        <button
          type="button"
          className="smallButton"
          disabled={!value.trim()}
          onClick={() => {
            void onSave(value).then(() => setValue(''))
          }}
        >
          Save
        </button>
        {stored ? (
          <button type="button" className="smallButton ghost" onClick={() => void onSave(null)}>
            Forget
          </button>
        ) : null}
      </div>
    </label>
  )
}
