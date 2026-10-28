import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useRouteLoaderData,
  useSearchParams,
} from 'react-router';
import type { loader as rootLoader } from '../root';
import type { Route } from './+types/account';
import { accountAction } from '../lib/account-action.server';
export function action({ request }: Route.ActionArgs) {
  return accountAction(request);
}
export default function Account() {
  const { user, authEnabled } = useRouteLoaderData<typeof rootLoader>('root')!;
  const [search] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const actionData = useActionData<typeof action>();
  const feedback = fetcher.data ?? actionData;
  if (!user)
    return (
      <section className="page narrow account-page">
        <span className="large-symbol" aria-hidden="true">
          ♙
        </span>
        <h1>
          A place for
          <br />
          your progress.
        </h1>
        <p>Keep your games, revisit your ideas, and see how far you can go.</p>
        {search.has('error') && (
          <p role="alert">Sign-in could not be completed. Please try again.</p>
        )}
        {authEnabled ? (
          <a className="button" href="/auth/google">
            Continue with Google
          </a>
        ) : (
          <>
            <button className="button" disabled>
              Google sign-in not configured
            </button>
            <p className="small-note">
              Guest play is available. The site owner needs to configure Google sign-in.
            </p>
          </>
        )}
        <Link className="text-link" to="/">
          Play as a guest
        </Link>
        <p className="small-note">
          Your first sign-in creates your account. Only your public name and achievements appear on
          the leaderboard.
        </p>
      </section>
    );
  return (
    <section className="page narrow">
      <h1>Your account.</h1>
      <p>Your public name appears on the leaderboard. Your games stay private.</p>
      <fetcher.Form method="post" className="account-form">
        <label htmlFor="public-name">Public name</label>
        <input
          id="public-name"
          name="name"
          defaultValue={user.name}
          minLength={2}
          maxLength={32}
          required
        />
        <button className="button" disabled={fetcher.state !== 'idle'}>
          Save name
        </button>
        <p role={feedback?.error ? 'alert' : 'status'}>{feedback?.error || feedback?.message}</p>
      </fetcher.Form>
      <Form action="/logout" method="post">
        <button className="text-link">Sign out</button>
      </Form>
    </section>
  );
}
