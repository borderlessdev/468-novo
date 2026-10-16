import type { LucideIcon } from 'lucide-react'
import { EmptyState, PageHeader } from '@/components/shared/PageHeader'

interface ClientModulePlaceholderProps {
  title: string
  icon: LucideIcon
}

/** Página provisória dos módulos do cliente até as telas reais serem ligadas nas mesmas rotas. */
export function ClientModulePlaceholder({ title, icon }: ClientModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="Área do cliente. A tela funcional deste módulo será adicionada aqui, sem mudar o menu nem as permissões."
      />
      <EmptyState
        icon={icon}
        title={`${title} em preparação`}
        description="A navegação e o acesso deste perfil já estão ativos. O conteúdo operacional entra nesta mesma página."
      />
    </div>
  )
}
