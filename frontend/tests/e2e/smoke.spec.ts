import { expect, test } from '@playwright/test'

test('home screen renders REELY SHORTS catalog shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'REELY SHORTS' })).toBeVisible()
  await expect(page.getByText('Trending now')).toBeVisible()
  await expect(page.getByRole('link', { name: /view details/i }).first()).toBeVisible()
})

test('admin route stays gated for non-admin viewers', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByText('Admin access required')).toBeVisible()
})
