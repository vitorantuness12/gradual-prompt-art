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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Confirme seu e-mail no {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar} />
        <Text style={brandName}>{siteName}</Text>
        <Heading style={h1}>Confirme seu e-mail</Heading>
        <Text style={text}>
          Obrigado por criar sua conta no{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          .
        </Text>
        <Text style={text}>
          Para ativar o acesso, confirme o endereço{' '}
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>{' '}
          clicando no botão abaixo:
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Confirmar e-mail
        </Button>
        <Hr style={hr} />
        <Text style={footer}>
          Se você não criou esta conta, pode ignorar este e-mail com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
