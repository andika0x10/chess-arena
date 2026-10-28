import { data } from 'react-router';
import { requireUser, sameOrigin, updatePublicName } from './db.server';

export async function accountAction(request: Request) {
  sameOrigin(request);
  const user = await requireUser(request);
  const fields = await request.formData();
  try {
    await updatePublicName(user.id, fields.get('name'));
    return { message: 'Public name saved.', error: '' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Use a public name'))
      return data({ message: '', error: error.message }, { status: 400 });
    throw error;
  }
}
