import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setVisible((prev) => !prev)}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
})
PasswordInput.displayName = 'PasswordInput'
