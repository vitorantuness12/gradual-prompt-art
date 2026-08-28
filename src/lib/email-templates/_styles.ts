/**
 * Estilos compartilhados dos e-mails de autenticação.
 * Cores derivadas do design system do app (primary: hsl(0 84% 50%) => #EB1414).
 * O fundo do Body permanece branco por compatibilidade com clientes de e-mail.
 */

export const BRAND = '#EB1414'
export const BRAND_DARK = '#991414'

export const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Sora, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '0',
}

export const container = {
  maxWidth: '520px',
  margin: '0 auto',
  padding: '32px 28px 40px',
}

export const brandBar = {
  height: '4px',
  backgroundColor: BRAND,
  borderRadius: '999px',
  margin: '0 0 28px',
}

export const brandName = {
  fontSize: '13px',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  color: BRAND,
  fontWeight: 700 as const,
  margin: '0 0 8px',
}

export const h1 = {
  fontSize: '24px',
  fontWeight: 700 as const,
  color: '#14161a',
  lineHeight: '1.25',
  margin: '0 0 20px',
}

export const text = {
  fontSize: '15px',
  color: '#4b4f57',
  lineHeight: '1.65',
  margin: '0 0 22px',
}

export const link = { color: BRAND, textDecoration: 'underline' }

export const button = {
  backgroundColor: BRAND,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  border: `1px solid ${BRAND}`,
  borderRadius: '10px',
  padding: '14px 26px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const code = {
  fontSize: '30px',
  fontWeight: 700 as const,
  letterSpacing: '8px',
  color: '#14161a',
  backgroundColor: '#f5f5f6',
  border: '1px solid #e6e6e8',
  borderRadius: '10px',
  padding: '18px 20px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}

export const hr = {
  border: 'none',
  borderTop: '1px solid #ececee',
  margin: '32px 0 20px',
}

export const footer = {
  fontSize: '12px',
  color: '#9a9ea6',
  lineHeight: '1.6',
  margin: '0',
}

// Renderizado como texto filho (pode ser escapado): sem >, & ou aspas.
export const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: ${BRAND} !important; color: #ffffff !important; }
  }
  [data-ogsc] .dm-btn { background-color: ${BRAND} !important; color: #ffffff !important; }
  [data-ogsb] .dm-btn { background-color: ${BRAND} !important; color: #ffffff !important; }
`
