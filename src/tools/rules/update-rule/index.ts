// ----------------------------
// UPDATE RULE TOOL
// ----------------------------

import { successWithJson, errorFromCatch } from '../../../utils/response.js';
import { updateRule } from '../../../actual-api.js';
import { RuleInputSchema } from '../input-schema.js';
import { RuleEntity } from '@actual-app/api/@types/loot-core/src/types/models/rule.js';

export const schema = {
  name: 'update-rule',
  description: 'Update a rule',
  inputSchema: RuleInputSchema,
};

export async function handler(
  args: Record<string, unknown>
): Promise<ReturnType<typeof successWithJson> | ReturnType<typeof errorFromCatch>> {
  try {
    if (!args.id || typeof args.id !== 'string') {
      return errorFromCatch('id is required and must be a string');
    }

    const { stage, conditionsOp, conditions, actions } = args;

    if ((stage !== 'pre' && stage !== 'post' && stage !== null && stage !== undefined) || typeof conditionsOp !== 'string') {
      return errorFromCatch('stage must be pre|post|null and conditionsOp is required');
    }

    if (!Array.isArray(conditions) || !Array.isArray(actions)) {
      return errorFromCatch('conditions and actions are required arrays');
    }

    const payload: RuleEntity = {
      id: args.id,
      stage: (stage ?? null) as RuleEntity['stage'],
      conditionsOp: conditionsOp as RuleEntity['conditionsOp'],
      conditions: conditions as RuleEntity['conditions'],
      actions: actions as RuleEntity['actions'],
    };

    await updateRule(payload);

    return successWithJson('Successfully updated rule ' + args.id);
  } catch (err) {
    return errorFromCatch(err);
  }
}
