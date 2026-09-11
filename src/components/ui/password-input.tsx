import * as React from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generatePassword } from '@/lib/password'
import { Input } from '@/components/ui/input'

export type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> & {
  /** Mostra botão compacto para gerar senha de 8 caracteres. */
  allowGenerate?: boolean
  /** Chamado após gerar (útil para espelhar em "confirmar senha"). */
  onGenerated?: (password: string) => void
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, allowGenerate = false, onGenerated, onChange, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false)
    const inputRef = React.useRef<HTMLInputElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      },
      [ref],
    )

    const handleGenerate = () => {
      const password = generatePassword(8)
      const el = inputRef.current
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set
        setter?.call(el, password)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      onChange?.({
        target: { value: password, name: props.name ?? '' },
      } as React.ChangeEvent<HTMLInputElement>)
      onGenerated?.(password)
      setVisible(true)
    }

    return (
      <div className="relative">
        <Input
          ref={setRefs}
          type={visible ? 'text' : 'password'}
          className={cn(allowGenerate ? 'pr-[4.5rem]' : 'pr-10', className)}
          {...props}
          onChange={onChange}
        />
        <div className="absolute inset-y-0 right-0 flex items-center">
          {allowGenerate ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Gerar senha"
              title="Gerar senha de 8 caracteres"
              className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              onClick={handleGenerate}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setVisible((prev) => !prev)}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
    )
  },
)
PasswordInput.displayName = 'PasswordInput'
