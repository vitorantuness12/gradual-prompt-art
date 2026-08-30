import * as React from 'react'

import {
  Body,
  Button,
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
  button,
  container,
  darkModeCss,
  footer,
  h1,
  hr,
  main,
  text,
} from './_styles'

/**
 * Aviso da assinatura recorrente: criada, pausada, retomada, cancelada ou
 * pedido do ciclo gerado. Um único template, com a frase montada pelo servidor,
 * evita cinco arquivos quase idênticos.
 */
interface SubscriptionEmailProps {
  customerName?: string
  storeName?: string
  headline?: string
  sentence?: string
  detail?: string | null
  actionUrl?: string
  actionLabel?: string
}

export const SubscriptionUpdateEmail = ({
  customerName = 'Olá',
  storeName = 'a loja',
  headline = 'Sua assinatura foi atualizada',
  sentence = 'Houve uma atualização na sua assinatura.',
  detail = null,
  actionUrl = 'https://oseupedido.com.br/meus-pedidos',
  actionLabel = 'Ver minha assinatura',
}: SubscriptionEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{`${storeName}: ${headline}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar} />
        <Text style={brandName}>O Seu Pedido</Text>
        <Heading style={h1}>{headline}</Heading>

        <Text style={text}>
          {customerName}, {sentence}
        </Text>

        {detail ? <Text style={text}>{detail}</Text> : null}

        <Button href={actionUrl} style={button}>
          {actionLabel}
        </Button>

        <Hr style={hr} />
        <Text style={footer}>
          Você pode pausar, retomar ou cancelar a assinatura quando quiser na área
          “Meus pedidos”. Este é um aviso automático da {storeName}.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SubscriptionUpdateEmail,
  subject: (data: Record<string, unknown>) =>
    `${String(data['headline'] ?? 'Atualização da sua assinatura')}`,
  displayName: 'Assinatura recorrente',
  previewData: {
    customerName: 'Ana',
    storeName: 'Padaria Bom Dia',
    headline: 'Assinatura criada',
    sentence: 'sua assinatura foi criada e o próximo pedido é gerado automaticamente.',
    detail: 'Próximo pedido: 05/09/2026 · Todo mês · R$ 89,90',
    actionUrl: 'https://oseupedido.com.br/meus-pedidos',
    actionLabel: 'Ver minha assinatura',
  },
}

export default SubscriptionUpdateEmail
