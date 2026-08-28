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

/** Aviso automático de mudança de situação do pedido. */
interface OrderStatusEmailProps {
  customerName?: string
  storeName?: string
  orderCode?: string
  statusSentence?: string
  trackingUrl?: string
  total?: number
}

const money = (value?: number) =>
  typeof value === 'number'
    ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

export const OrderStatusEmail = ({
  customerName = 'Olá',
  storeName = 'a loja',
  orderCode = '000000',
  statusSentence = 'teve uma atualização',
  trackingUrl = 'https://oseupedido.com.br/acompanhar',
  total,
}: OrderStatusEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{`Pedido #${orderCode}: ${statusSentence}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar} />
        <Text style={brandName}>O Seu Pedido</Text>
        <Heading style={h1}>Seu pedido {statusSentence}</Heading>
        <Text style={text}>
          {customerName}, o pedido #{orderCode} na {storeName} {statusSentence}.
          {money(total) ? ` Valor total: ${money(total)}.` : ''}
        </Text>
        <Button className="dm-btn" style={button} href={trackingUrl}>
          Acompanhar pedido
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Você recebe este aviso porque confirmou seu telefone nesta loja. Para
          parar de receber, acesse a área do cliente em
          oseupedido.com.br/meus-pedidos.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default OrderStatusEmail

export const template = {
  component: OrderStatusEmail,
  subject: (data: Record<string, any>) =>
    `Pedido #${data['orderCode'] ?? ''}: ${data['statusSentence'] ?? 'atualização'}`,
  displayName: 'Atualização de pedido',
  previewData: {
    customerName: 'Ana',
    storeName: 'Lanches do Antunes',
    orderCode: 'A1B2C3',
    statusSentence: 'saiu para entrega',
    trackingUrl: 'https://oseupedido.com.br/acompanhar',
    total: 78.9,
  },
}
