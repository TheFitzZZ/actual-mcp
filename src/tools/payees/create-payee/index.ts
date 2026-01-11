// ----------------------------
// CREATE PAYEE TOOL
// ----------------------------

import { successWithJson, errorFromCatch } from '../../../utils/response.js';
import { createPayee } from '../../../actual-api.js';
import { APIPayeeEntity } from '@actual-app/api/@types/loot-core/src/server/api-models.js';

export const schema = {
  name: 'create-payee',
  description: 'Create a new payee',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Name of the payee',
      },
      transferAccount: {
        type: 'string',
        description: 'ID of the transfer account. Should be in UUID format. Only for transfer payees.',
      },
    },
    required: ['name'],
  },
};

export async function handler(
  args: Record<string, unknown>
): Promise<ReturnType<typeof successWithJson> | ReturnType<typeof errorFromCatch>> {
  try {
    if (!args.name || typeof args.name !== 'string') {
      return errorFromCatch('name is required and must be a string');
    }

    if (args.transferAccount && typeof args.transferAccount !== 'string') {
      return errorFromCatch('transferAccount must be a string if provided');
    }

    const name: string = args.name as string;
    const transferAccount: string | undefined = args.transferAccount as string | undefined;

    const data: Omit<APIPayeeEntity, 'id'> = { name };
    if (transferAccount) {
      data.transfer_acct = transferAccount;
    }

    const id: string = await createPayee(data);

    return successWithJson('Successfully created payee ' + id);
  } catch (err) {
    return errorFromCatch(err);
  }
}
