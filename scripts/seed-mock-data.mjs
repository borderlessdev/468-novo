/**
 * Popula o Firestore com dados mocados (visitas, visitantes, agenda, tarefas e financeiro).
 * Não sobe arquivos de nota fiscal/orçamento (isso fica de fora de propósito).
 * Uso: node scripts/seed-mock-data.mjs
 */
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDfrFNQHOZfweb-V-O2sssoVQIwupVVgxc',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'programa-visitas-72be9.firebaseapp.com',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'programa-visitas-72be9',
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || 'programa-visitas-72be9.firebasestorage.app',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '112848844249',
  appId: process.env.VITE_FIREBASE_APP_ID || '1:112848844249:web:1a8f5b0d8e6bec6bc315c8',
}

const OWNER = {
  email: 'operador@promover.experience',
  password: 'Demo@123456',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function ensureOwner() {
  try {
    const credential = await signInWithEmailAndPassword(auth, OWNER.email, OWNER.password)
    return credential.user.uid
  } catch (error) {
    if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-credential') {
      const credential = await createUserWithEmailAndPassword(auth, OWNER.email, OWNER.password)
      return credential.user.uid
    }
    throw error
  }
}

function addDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

async function createVisit(ownerId, data) {
  const ref = await addDoc(collection(db, 'visits'), {
    ...data,
    teamMemberIds: [],
    clientUserIds: [],
    isTemplate: false,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

async function createVisitor(ownerId, data) {
  const ref = await addDoc(collection(db, 'visitors'), {
    ...data,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

async function linkVisitor(ownerId, visitId, visitorId) {
  await addDoc(collection(db, 'visitVisitors'), {
    visitId,
    visitorId,
    ownerId,
    createdAt: serverTimestamp(),
  })
}

async function createActivity(ownerId, visitId, data) {
  await addDoc(collection(db, 'activities'), {
    ...data,
    visitId,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

async function createTask(ownerId, visitId, data) {
  await addDoc(collection(db, 'tasks'), {
    ...data,
    visitId,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

async function createFinanceItem(ownerId, visitId, data) {
  await addDoc(collection(db, 'financeItems'), {
    visitId,
    serviceName: data.serviceName,
    budget1: data.budget1 ?? null,
    budget2: data.budget2 ?? null,
    budget3: data.budget3 ?? null,
    serviceValue: data.serviceValue ?? null,
    winningCompany: data.winningCompany ?? null,
    nfReceived: data.nfReceived ?? false,
    nfDueDate: data.nfDueDate ?? null,
    attachmentPath: null,
    attachmentName: null,
    budgetAttachments: [],
    invoiceAttachment: null,
    ownerId,
    isDeleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

async function seed() {
  const ownerId = await ensureOwner()
  console.log('Autenticado como', OWNER.email, ownerId)

  const visit1 = await createVisit(ownerId, {
    title: 'Visita técnica — Planta São Paulo',
    company: 'Acme Indústria Ltda.',
    state: 'SP',
    city: 'São Paulo',
    startDate: addDays(7),
    endDate: addDays(10),
    status: 'planejamento',
    objective: 'Avaliação de processo produtivo e reunião com diretoria',
    language: 'pt-BR',
    pvNumber: 'PV-2026-0142',
    progress: 25,
  })
  console.log('Visita criada:', visit1)

  const visit2 = await createVisit(ownerId, {
    title: 'Missão comercial — Feira Internacional',
    company: 'Global Trade Corp.',
    state: 'RJ',
    city: 'Rio de Janeiro',
    startDate: addDays(-5),
    endDate: addDays(-2),
    status: 'concluida',
    objective: 'Prospecção de novos parceiros comerciais',
    language: 'en-US',
    pvNumber: 'PV-2026-0098',
    progress: 100,
  })
  console.log('Visita criada:', visit2)

  const visitorsData = [
    { name: 'John Smith', document: 'US123456789', company: 'Acme Indústria Ltda.', role: 'CEO', country: 'EUA', language: 'en', weightKg: 82, shoeSize: 43, dietaryRestriction: 'Sem restrição' },
    { name: 'Maria Fernández', document: 'ES987654321', company: 'Acme Indústria Ltda.', role: 'Diretora de Operações', country: 'Espanha', language: 'es', weightKg: 65, shoeSize: 37, dietaryRestriction: 'Vegetariana' },
    { name: 'Hiroshi Tanaka', document: 'JP456123789', company: 'Global Trade Corp.', role: 'Gerente de Compras', country: 'Japão', language: 'ja', weightKg: 74, shoeSize: 41, dietaryRestriction: 'Sem restrição' },
  ]

  const visitorIds = []
  for (const visitor of visitorsData) {
    const id = await createVisitor(ownerId, visitor)
    visitorIds.push(id)
    console.log('Visitante criado:', visitor.name, id)
  }

  await linkVisitor(ownerId, visit1, visitorIds[0])
  await linkVisitor(ownerId, visit1, visitorIds[1])
  await linkVisitor(ownerId, visit2, visitorIds[2])

  await createActivity(ownerId, visit1, {
    title: 'Recepção no aeroporto',
    description: 'Transfer e check-in no hotel',
    location: 'Aeroporto de Guarulhos',
    date: addDays(7),
    startTime: '09:00',
    endTime: '10:30',
    responsibleNames: ['Equipe Demo'],
    visitorNames: ['John Smith', 'Maria Fernández'],
  })
  await createActivity(ownerId, visit1, {
    title: 'Visita à planta produtiva',
    description: 'Tour guiado pelas linhas de produção',
    location: 'Planta São Paulo',
    date: addDays(8),
    startTime: '14:00',
    endTime: '17:00',
    responsibleNames: ['Operador Demo'],
    visitorNames: ['John Smith', 'Maria Fernández'],
  })
  await createActivity(ownerId, visit2, {
    title: 'Rodada de negócios',
    description: 'Reuniões B2B com parceiros locais',
    location: 'Centro de Convenções Riocentro',
    date: addDays(-4),
    startTime: '10:00',
    endTime: '12:00',
    responsibleNames: ['Operador Demo'],
    visitorNames: ['Hiroshi Tanaka'],
  })
  console.log('Atividades criadas')

  await createTask(ownerId, visit1, { title: 'Confirmar hotel e transfer', status: 'completed', order: 0 })
  await createTask(ownerId, visit1, { title: 'Enviar agenda para os visitantes', status: 'in_progress', order: 1, dueDate: addDays(5) })
  await createTask(ownerId, visit1, { title: 'Preparar apresentação institucional', status: 'backlog', order: 2, dueDate: addDays(6), assigneeName: 'Equipe Demo' })
  await createTask(ownerId, visit2, { title: 'Enviar relatório final ao cliente', status: 'backlog', order: 0, dueDate: addDays(3) })
  console.log('Tarefas criadas')

  await createFinanceItem(ownerId, visit1, {
    serviceName: 'Transporte executivo',
    budget1: 4500,
    budget2: 5200,
    budget3: 4800,
    serviceValue: 4500,
    winningCompany: 'Transportadora Rápida Ltda.',
    nfReceived: false,
    nfDueDate: addDays(15),
  })
  await createFinanceItem(ownerId, visit1, {
    serviceName: 'Hospedagem (3 diárias)',
    budget1: 12000,
    budget2: 11500,
    budget3: 13000,
    serviceValue: 11500,
    winningCompany: 'Hotel Business Center',
    nfReceived: false,
  })
  await createFinanceItem(ownerId, visit2, {
    serviceName: 'Estande na feira',
    budget1: 32000,
    serviceValue: 32000,
    winningCompany: 'Feira Expo Eventos',
    nfReceived: true,
    nfDueDate: addDays(-1),
  })
  console.log('Itens financeiros criados (sem anexos de orçamento/nota fiscal)')

  console.log('\nSeed concluído com sucesso.')
  process.exit(0)
}

seed().catch((error) => {
  console.error('Falha no seed:', error)
  process.exit(1)
})
