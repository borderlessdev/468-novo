import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { RotateCcw, Trash2 } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/PageHeader'
import { ConfirmDeleteDialog, useConfirmDelete } from '@/components/shared/ConfirmDeleteDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/AuthContext'
import {
  getDaysUntilExpiry,
  TRASH_CATEGORY_LABELS,
  TRASH_RETENTION_DAYS,
} from '@/lib/trash'
import { formatDate } from '@/lib/utils'
import {
  listTrashItems,
  permanentDeleteEntity,
  restoreEntity,
} from '@/services/trash'
import type { TrashEntityType, TrashItem } from '@/types'

const CATEGORY_ORDER: TrashEntityType[] = [
  'visit',
  'visitor',
  'activity',
  'task',
  'financeItem',
  'document',
]

function formatTrashDate(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    return formatDate((value as { toDate: () => Date }).toDate())
  }
  return '—'
}

export function TrashPage() {
  const { user, isAdmin, role } = useAuth()
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<TrashEntityType | 'all'>('all')
  const [trash, setTrash] = useState<Record<TrashEntityType, TrashItem[]>>({
    visit: [],
    visitor: [],
    activity: [],
    task: [],
    financeItem: [],
    document: [],
  })
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const permanentDialog = useConfirmDelete<TrashItem>()

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      setTrash(await listTrashItems(user.uid, isAdmin, role))
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar lixeira')
    } finally {
      setLoading(false)
    }
  }, [user, isAdmin, role])

  useEffect(() => {
    void load()
  }, [load])

  const allItems = useMemo(
    () => CATEGORY_ORDER.flatMap((type) => trash[type]),
    [trash],
  )

  const visibleItems = useMemo(() => {
    if (activeCategory === 'all') return allItems
    return trash[activeCategory]
  }, [activeCategory, allItems, trash])

  const categoryCounts = useMemo(
    () =>
      CATEGORY_ORDER.reduce(
        (acc, type) => {
          acc[type] = trash[type].length
          return acc
        },
        {} as Record<TrashEntityType, number>,
      ),
    [trash],
  )

  const handleRestore = async (item: TrashItem) => {
    setRestoringId(item.id)
    try {
      await restoreEntity(item.entityType, item.id)
      toast.success('Item restaurado')
      await load()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível restaurar')
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = () => {
    void permanentDialog.confirm(async (item) => {
      try {
        await permanentDeleteEntity(item.entityType, item.id)
        toast.success('Item apagado permanentemente')
        await load()
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível apagar')
        throw error
      }
    })
  }

  return (
    <div>
      <PageHeader
        title="Lixeira"
        description={`Itens excluídos ficam disponíveis por ${TRASH_RETENTION_DAYS} dias antes da remoção automática.`}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={activeCategory === 'all' ? 'default' : 'outline'}
          onClick={() => setActiveCategory('all')}
        >
          Todos ({allItems.length})
        </Button>
        {CATEGORY_ORDER.map((type) => (
          <Button
            key={type}
            size="sm"
            variant={activeCategory === type ? 'default' : 'outline'}
            onClick={() => setActiveCategory(type)}
          >
            {TRASH_CATEGORY_LABELS[type]} ({categoryCounts[type]})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Lixeira vazia"
          description={
            activeCategory === 'all'
              ? 'Nenhum item excluído no momento.'
              : `Nenhum item em ${TRASH_CATEGORY_LABELS[activeCategory as TrashEntityType]}.`
          }
        />
      ) : activeCategory === 'all' ? (
        <div className="space-y-6">
          {CATEGORY_ORDER.map((type) =>
            trash[type].length > 0 ? (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {TRASH_CATEGORY_LABELS[type]} ({trash[type].length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {trash[type].map((item) => (
                    <TrashItemRow
                      key={`${type}-${item.id}`}
                      item={item}
                      restoring={restoringId === item.id}
                      onRestore={() => void handleRestore(item)}
                      onPermanentDelete={() => permanentDialog.requestDelete(item)}
                    />
                  ))}
                </CardContent>
              </Card>
            ) : null,
          )}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {TRASH_CATEGORY_LABELS[activeCategory]} ({visibleItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {visibleItems.map((item) => (
              <TrashItemRow
                key={item.id}
                item={item}
                restoring={restoringId === item.id}
                onRestore={() => void handleRestore(item)}
                onPermanentDelete={() => permanentDialog.requestDelete(item)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDeleteDialog
        open={permanentDialog.open}
        onOpenChange={permanentDialog.handleOpenChange}
        title="Apagar permanentemente?"
        description={
          permanentDialog.target
            ? `"${permanentDialog.target.title}" será removido para sempre. Esta ação não pode ser desfeita.`
            : 'Este item será removido para sempre. Esta ação não pode ser desfeita.'
        }
        confirmLabel="Apagar permanentemente"
        loading={permanentDialog.loading}
        onConfirm={handlePermanentDelete}
      />
    </div>
  )
}

function TrashItemRow({
  item,
  restoring,
  onRestore,
  onPermanentDelete,
}: {
  item: TrashItem
  restoring: boolean
  onRestore: () => void
  onPermanentDelete: () => void
}) {
  const daysLeft = getDaysUntilExpiry(item.expiresAt)

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{item.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {TRASH_CATEGORY_LABELS[item.entityType]}
          {' · '}
          Excluído em {formatTrashDate(item.deletedAt)}
          {daysLeft != null ? ` · ${daysLeft} dia(s) restante(s)` : ''}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={restoring}
          onClick={onRestore}
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar
        </Button>
        <Button size="sm" variant="destructive" onClick={onPermanentDelete}>
          <Trash2 className="h-4 w-4" />
          Apagar
        </Button>
      </div>
    </div>
  )
}
