import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { buildPvTemplateWorkbook, parsePvWorkbook, type ImportedPv } from '@/lib/pvImport'
import { importPvHistory } from '@/services/visits'

type Props = {
  orgId: string
  userId: string
  onImported?: () => void
}

/** Importa o histórico de PVs (planilha 2023–2026) para a numeração da Vale. */
export function PvHistoryImportCard({ orgId, userId, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportedPv[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setFileName('')
    setRows([])
    setWarnings([])
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setReading(true)
    try {
      const result = parsePvWorkbook(await file.arrayBuffer())
      setFileName(file.name)
      setRows(result.rows)
      setWarnings(result.warnings)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível ler a planilha. Use um arquivo .xlsx, .xls ou .csv.')
      reset()
    } finally {
      setReading(false)
    }
  }

  const confirmImport = async () => {
    if (rows.length === 0) return
    setSaving(true)
    try {
      const result = await importPvHistory(orgId, userId, rows)
      toast.success(
        `${result.created} PV(s) importada(s)` +
          (result.skipped > 0 ? ` · ${result.skipped} já existiam` : ''),
      )
      reset()
      onImported?.()
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível importar as PVs. Verifique as permissões e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([buildPvTemplateWorkbook()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo-historico-pv.xlsx'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <CardTitle>Histórico de PVs (2023–2026)</CardTitle>
            <CardDescription>
              Importe a planilha de PVs já usadas. Elas entram na lista do campo “Número da PV”,
              no aviso de número já existente e na sugestão do próximo número. PVs que já existem
              são ignoradas.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={reading || saving}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {reading ? 'Lendo…' : 'Escolher planilha'}
          </Button>
          <Button type="button" variant="ghost" onClick={downloadTemplate}>
            <Download className="h-4 w-4" />
            Baixar modelo
          </Button>
        </div>

        {fileName ? (
          <div className="space-y-3 rounded-lg border p-3 text-sm">
            <p>
              <span className="font-medium">{fileName}</span> · {rows.length} PV(s) encontrada(s)
            </p>
            {rows.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Prévia:{' '}
                {rows
                  .slice(0, 12)
                  .map((row) => row.pvNumber)
                  .join(', ')}
                {rows.length > 12 ? ` … (+${rows.length - 12})` : ''}
              </p>
            ) : null}
            {warnings.map((warning) => (
              <p key={warning} className="text-xs text-amber-700">
                {warning}
              </p>
            ))}
            <div className="flex gap-2">
              <Button type="button" onClick={() => void confirmImport()} disabled={saving || rows.length === 0}>
                {saving ? 'Importando…' : `Importar ${rows.length} PV(s)`}
              </Button>
              <Button type="button" variant="ghost" onClick={reset} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
