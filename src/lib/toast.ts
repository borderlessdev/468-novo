import { toast } from 'sonner'

export const TRASH_PATH = '/configuracoes/lixeira'

let navigateToTrash: (() => void) | null = null

export function setTrashNavigation(navigate: () => void) {
  navigateToTrash = navigate
}

export function toastMovedToTrash(message = 'Item movido para a lixeira') {
  toast.success(message, {
    action: {
      label: 'Lixeira',
      onClick: () => navigateToTrash?.(),
    },
  })
}
