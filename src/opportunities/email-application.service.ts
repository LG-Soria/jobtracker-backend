import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'node:fs/promises';

const nodemailer = require('nodemailer') as {
  createTransport: (options: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  }) => {
    sendMail: (input: {
      from: string;
      to: string;
      subject: string;
      text: string;
      attachments: Array<{ filename: string; path: string }>;
    }) => Promise<{ messageId: string }>;
  };
};

type SendEmailApplicationInput = {
  to: string;
  subject: string;
  body: string;
  attachmentPath: string;
  attachmentName: string;
};

@Injectable()
export class EmailApplicationService {
  async sendApplication(input: SendEmailApplicationInput) {
    await ensureFile(input.attachmentPath);

    if (process.env.SMTP_MOCK_MODE === 'true') {
      return {
        messageId: `mock-${Date.now()}`,
      };
    }

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'SMTP_HOST, SMTP_USER and SMTP_PASS are required to send applications.',
      );
    }

    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure = port === 465;
    const from = process.env.SMTP_FROM ?? user;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const result = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      attachments: [
        {
          filename: input.attachmentName,
          path: input.attachmentPath,
        },
      ],
    });

    return {
      messageId: result.messageId,
    };
  }
}

async function ensureFile(path: string) {
  try {
    await fs.access(path);
  } catch {
    throw new InternalServerErrorException(`CV file not found at ${path}.`);
  }
}
