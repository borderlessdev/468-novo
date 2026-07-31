import { test, expect } from '@playwright/test'

test('smoke: login page loads', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel(/e-mail/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /entrar/i })).toBeVisible()
})

test('smoke: cadastro page loads', async ({ page }) => {
  await page.goto('/cadastro')
  await expect(page.getByLabel(/^nome$/i)).toBeVisible()
})
