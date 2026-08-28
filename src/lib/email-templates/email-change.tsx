import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
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
  link,
  main,
  text,
} from './_styles'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail é o endereço atual do usuário (HookData.OldEmail). No envio para o
  // NOVO destinatário, `email` é igual ao destinatário, então a frase precisa
  // usar oldEmail para ler "de ANTIGO para NOVO".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Confirme a troca de e-mail no {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar} />
        <Text style={brandName}>{siteName}</Text>
        <Heading style={h1}>Confirme a troca de e-mail</Heading>
        <Text style={text}>
          Você pediu para alterar o e-mail da sua conta no {siteName} de{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>
            {oldEmail}
          </Link>{' '}
          para{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>Clique no botão abaixo para confirmar a mudança:</Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Confirmar novo e-mail
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Se você não solicitou essa alteração, proteja sua conta imediatamente
          trocando a senha.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
