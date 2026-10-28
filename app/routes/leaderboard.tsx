import { Link } from 'react-router';
import type { Route } from './+types/leaderboard';
import { db } from '../lib/db.server';
type Row = { id: string; name: string; highest: number; conquered: number; rank: number };
export async function loader() {
  const rows = await db()
    .prepare(
      'SELECT u.id,u.name,MAX(a.level) AS highest,COUNT(*) AS conquered,DENSE_RANK() OVER (ORDER BY MAX(a.level) DESC,COUNT(*) DESC) AS rank FROM achievements a JOIN users u ON u.id=a.user_id GROUP BY u.id ORDER BY highest DESC,conquered DESC,u.id LIMIT 100',
    )
    .all<Row>();
  return { rows: rows.results };
}
export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  return (
    <section className="page list-page">
      <div className="page-heading">
        <div>
          <p className="small-note">One challenge at a time.</p>
          <h1>Steady progress.</h1>
        </div>
        <p>
          The levels you’ve conquered.
          <br />
          The ideas you’ve picked up along the way.
        </p>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Player</th>
              <th>Highest level</th>
              <th>Levels conquered</th>
            </tr>
          </thead>
          <tbody>
            {loaderData.rows.map((row) => (
              <tr key={row.id}>
                <td className="rank">{row.rank}</td>
                <td>{row.name}</td>
                <td>Level {row.highest}</td>
                <td>{row.conquered} / 6</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loaderData.rows.length && (
        <div className="empty">
          <span aria-hidden="true">♔</span>
          <h2>The board is open.</h2>
          <p>Win a game while signed in to set your first milestone.</p>
          <Link className="button" to="/">
            Play a game
          </Link>
        </div>
      )}
      <aside className="leaderboard-note">
        <strong>A friendly measure of progress.</strong>
        <p>
          Ranked by highest level beaten, then different levels conquered. Equal achievements share
          a rank. Repeat wins don’t add points.
        </p>
        <p>
          This is a casual leaderboard. Moves are checked for legality; computer difficulty runs in
          the player’s browser and is not independently verified.
        </p>
      </aside>
    </section>
  );
}
