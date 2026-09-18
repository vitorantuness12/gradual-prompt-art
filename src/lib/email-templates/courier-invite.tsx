import * as React from "react";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { brandBar, brandName, button, container, darkModeCss, footer, h1, hr, main, text } from "./_styles";

interface CourierInviteEmailProps {
  courierName?: string;
  storeName?: string;
  activationUrl?: string;
}

export function CourierInviteEmail({ courierName = "Olá", storeName = "uma loja", activationUrl = "https://pedium.com.br/entregadores" }: CourierInviteEmailProps) {
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head><style>{darkModeCss}</style></Head>
      <Preview>{`${storeName} convidou você para fazer entregas`}</Preview>
      <Body style={main}><Container style={container}>
        <Section style={brandBar} />
        <Text style={brandName}>Pedi Um Entregadores</Text>
        <Heading style={h1}>Seu acesso de entregador está pronto</Heading>
        <Text style={text}>{courierName}, a loja <strong>{storeName}</strong> convidou você para receber e acompanhar entregas pelo Pedi Um.</Text>
        <Button className="dm-btn" style={button} href={activationUrl}>Ativar meu acesso</Button>
        <Text style={text}>O link é pessoal, expira em 7 dias e não deve ser compartilhado.</Text>
        <Hr style={hr} />
        <Text style={footer}>Se você não esperava este convite, ignore esta mensagem com segurança.</Text>
      </Container></Body>
    </Html>
  );
}

export const template = {
  component: CourierInviteEmail,
  subject: (data: Record<string, unknown>) => `${String(data["storeName"] ?? "Uma loja")} convidou você para fazer entregas`,
  displayName: "Convite de entregador",
  previewData: { courierName: "Carlos", storeName: "Lanches do Antunes", activationUrl: "https://pedium.com.br/entregadores?convite=exemplo" },
};