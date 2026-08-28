import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

import {
  brandBar,
  brandName,
  container,
  darkModeCss,
  footer,
  h1,
  hr,
  main,
  text,
} from './_styles'

/** Código de 6 dígitos para confirmar a identidade do cliente no checkout. */
interface VerificationCodeEmailProps {
  code?: string
  storeName?: string
  customerName?: string
}

const codeStyle: React.CSSProperties = {
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '8px',
  textAlign: 'center',
  margin: '24px 0',
}

export const VerificationCodeEmail = ({
  code = '000000',
  storeName = 'a loja',
  customerName = 'Olá',
}: VerificationCodeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{`Seu código de confirmação é ${code}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar} />
        <Text style={brandName}>O Seu Pedido</Text>
        <Heading style={h1}>Confirme que é você</Heading>
        <Text style={text}>
          {customerName}, use o código abaixo para confirmar seu telefone no
          pedido em {storeName}. Ele vale por 10 minutos.
        </Text>
        <Text style={codeStyle}>{code}</Text>
        <Hr style={hr} />
        <Text style={footer}>
          Se não foi você que pediu este código, ignore este e-mail — nenhum dado
          é liberado sem a confirmação.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default VerificationCodeEmail

export const template = {
  component: VerificationCodeEmail,
  subject: (data: Record<string, any>) =>
    `Seu código de confirmação: ${data['code'] ?? ''}`,
  displayName: 'Código de confirmação',
  previewData: {
    code: '123456',
    storeName: 'Lanches do Antunes',
    customerName: 'Ana',
  },
}
