import { jsPDF } from 'jspdf'
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import * as XLSX from 'xlsx'
import { downloadCsv } from '@/lib/utils'

export type TableExportFormat = 'csv' | 'pdf' | 'xlsx' | 'docx'

export interface TableExportData {
  filenameBase: string
  title: string
  headers: string[]
  rows: string[][]
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function exportCsv(data: TableExportData) {
  downloadCsv(`${data.filenameBase}.csv`, [data.headers, ...data.rows])
}

function exportPdf(data: TableExportData) {
  const doc = new jsPDF({ orientation: 'landscape' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 14
  const colCount = data.headers.length
  const colWidth = (pageWidth - margin * 2) / colCount
  let y = 20

  doc.setFontSize(14)
  doc.text(data.title, margin, y)
  y += 10

  doc.setFontSize(8)
  data.headers.forEach((header, index) => {
    doc.text(header, margin + index * colWidth, y, { maxWidth: colWidth - 2 })
  })
  y += 6

  data.rows.forEach((row) => {
    if (y > doc.internal.pageSize.getHeight() - 14) {
      doc.addPage()
      y = 20
    }
    row.forEach((cell, index) => {
      doc.text(cell, margin + index * colWidth, y, { maxWidth: colWidth - 2 })
    })
    y += 6
  })

  doc.save(`${data.filenameBase}.pdf`)
}

function exportXlsx(data: TableExportData) {
  const worksheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    `${data.filenameBase}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

async function exportDocx(data: TableExportData) {
  const headerRow = new TableRow({
    children: data.headers.map(
      (header) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: header, bold: true })],
            }),
          ],
        }),
    ),
  })

  const bodyRows = data.rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [new Paragraph(cell)],
            }),
        ),
      }),
  )

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: data.title, bold: true, size: 28 })],
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...bodyRows],
          }),
        ],
      },
    ],
  })

  const blob = await Packer.toBlob(document)
  downloadBlob(`${data.filenameBase}.docx`, blob)
}

const FORMAT_LABELS: Record<TableExportFormat, string> = {
  csv: 'CSV',
  pdf: 'PDF',
  xlsx: 'Excel (.xlsx)',
  docx: 'Word (.docx)',
}

export function getExportFormatLabel(format: TableExportFormat): string {
  return FORMAT_LABELS[format]
}

export async function exportTable(format: TableExportFormat, data: TableExportData) {
  switch (format) {
    case 'csv':
      exportCsv(data)
      break
    case 'pdf':
      exportPdf(data)
      break
    case 'xlsx':
      exportXlsx(data)
      break
    case 'docx':
      await exportDocx(data)
      break
  }
}
