import { expect, test, type Page } from '@playwright/test';

const PASSPHRASE = 'cuatro palabras muy largas';

/** Intl uses non-breaking spaces in amounts; match them loosely. */
const money = (text: string) =>
  new RegExp(text.replace(/[$.]/g, (c) => `\\${c}`).replace(/ /g, '\\s'));

async function go(page: Page, link: string) {
  await page.getByRole('link', { name: link, exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: link })).toBeVisible();
}

test('set up, record and reverse an expense, log out and back in', async ({ page }) => {
  page.on('dialog', (dialog) => void dialog.accept());

  // First run: create the encrypted store without demo data.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Crea tu frase de acceso' })).toBeVisible();
  await page.getByLabel('Frase de acceso', { exact: true }).fill(PASSPHRASE);
  await page.getByLabel('Repite la frase').fill(PASSPHRASE);
  await page.getByLabel('Cargar datos de ejemplo').uncheck();
  await page.getByRole('button', { name: 'Crear y entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();

  // Master data.
  await go(page, 'Cuentas');
  await page.getByLabel('Nombre').fill('Ahorros');
  await page.getByLabel('Saldo inicial').fill('1.000.000');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Ahorros', { exact: true })).toBeVisible();
  await expect(page.getByText(money('$ 1.000.000'))).toBeVisible();

  await go(page, 'Categorías');
  await page.getByLabel('Nombre').fill('Mercado');
  await page.getByRole('button', { name: 'Crear categoría' }).click();
  await expect(page.getByText('Mercado', { exact: true })).toBeVisible();

  // An expense with centavos.
  await go(page, 'Movimientos');
  await page.getByLabel('Monto').fill('125.000,50');
  await page.getByLabel('Desde la cuenta').selectOption({ label: 'Ahorros' });
  await page.getByLabel('Categoría').selectOption({ label: 'Mercado' });
  await page.getByRole('button', { name: 'Guardar movimiento' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Gasto' });
  await expect(row).toContainText(money('-$ 125.000,50'));

  await go(page, 'Resumen');
  await expect(page.getByText(money('$ 874.999,50')).first()).toBeVisible();

  // Reversal restores the balance; the original stays in the history.
  await go(page, 'Movimientos');
  await row.getByRole('button', { name: 'Reversar' }).click();
  await expect(page.getByText('(reversado)')).toBeVisible();
  await expect(page.getByText('(reversión)')).toBeVisible();
  await go(page, 'Resumen');
  await expect(page.getByText(money('$ 1.000.000')).first()).toBeVisible();

  // Log out, fail once, log in.
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Ingresar' })).toBeVisible();
  await page.getByLabel('Frase de acceso').fill('frase equivocada');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText('La frase de acceso no es correcta.');
  await page.getByLabel('Frase de acceso').fill(PASSPHRASE);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
  await expect(page.getByText(money('$ 1.000.000')).first()).toBeVisible();
});
