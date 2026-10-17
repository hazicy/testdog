'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { authClient } from '@/client/auth';
import { reloadWorkspace } from '../navigation';
import { api, fetchJson } from '@/client/api';
import { useToastManager } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { TeamWorkspace } from '@testdog/contracts/teams/types';
import styles from './Teams.module.css';

type Result = { activeTeamId?: string | null; invitationToken?: string };

export function TeamSettings({ invitation }: { invitation?: string }) {
  const t = useTranslations('teams');
  const { data: session } = authClient.useSession();
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<TeamWorkspace>(session ? '/api/teams' : null, fetchJson);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const toastManager = useToastManager();
  const active = data?.teams.find((team) => team.id === data.activeTeamId);
  const admin = active?.role === 'admin';

  async function command(body: object) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const result = await api.post('/api/teams', { json: body }).json<Result>();

      if ('activeTeamId' in result) {
        reloadWorkspace('/settings?team=1');

        return;
      }

      if (result.invitationToken) {
        const url = new URL('/settings', window.location.origin);

        url.searchParams.set('invite', result.invitationToken);
        setInvitationLink(url.toString());
      }

      await mutate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('failed'));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, action: 'create' | 'rename' | 'invite') {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    void command({
      action,
      teamId: active?.id,
      ...(action === 'invite' ? { email: form.get('email') } : { name: form.get('name') }),
    });
  }

  return (
    <div className={styles.settings}>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {invitation && (
        <section className={styles.section}>
          <h2 className={styles.heading}>{t('invitation')}</h2>
          <Button
            disabled={pending}
            variant="primary"
            onClick={() => command({ action: 'accept', token: invitation })}
          >
            {t('accept')}
          </Button>
        </section>
      )}
      {loadError ? (
        <Button onClick={() => mutate()}>{t('retry')}</Button>
      ) : !data ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          {active && (
            <section className={styles.section}>
              <h2 className={styles.heading}>{active.name}</h2>
              {admin && (
                <form
                  className={styles.row}
                  onSubmit={(event) => submit(event, 'rename')}
                  key={active.id + active.name}
                >
                  <label className={styles.field}>
                    <span>{t('name')}</span>
                    <Input
                      name="name"
                      defaultValue={active.name}
                      required
                      maxLength={80}
                      disabled={pending}
                    />
                  </label>
                  <Button type="submit" disabled={pending}>
                    {t('rename')}
                  </Button>
                </form>
              )}
              <h3 className={styles.heading}>{t('members')}</h3>
              <ul className={styles.list}>
                {data.members.map((member) => (
                  <li key={member.userId} className={styles.row}>
                    <div className={styles.identity}>
                      <span>{member.name}</span>
                      <span className={styles.muted}>{member.email}</span>
                    </div>
                    {admin ? (
                      <Select
                        aria-label={t('roleFor', { name: member.name })}
                        disabled={pending}
                        value={member.role}
                        items={[
                          { value: 'admin', label: t('admin') },
                          { value: 'member', label: t('member') },
                        ]}
                        onValueChange={(role) =>
                          command({
                            action: 'member',
                            teamId: active.id,
                            userId: member.userId,
                            role,
                          })
                        }
                      />
                    ) : (
                      <span>{t(member.role)}</span>
                    )}
                    {(admin || member.userId === session?.user.id) && (
                      <Button
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(
                              t(
                                member.userId === session?.user.id
                                  ? 'confirmLeave'
                                  : 'confirmRemove',
                                { name: member.name },
                              ),
                            )
                          )
                            void command({
                              action: 'remove',
                              teamId: active.id,
                              userId: member.userId,
                            });
                        }}
                      >
                        {t(member.userId === session?.user.id ? 'leave' : 'remove')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {admin && (
                <>
                  <form className={styles.row} onSubmit={(event) => submit(event, 'invite')}>
                    <label className={styles.field}>
                      <span>{t('inviteEmail')}</span>
                      <Input type="email" name="email" required disabled={pending} />
                    </label>
                    <Button type="submit" disabled={pending}>
                      {t('invite')}
                    </Button>
                  </form>
                  {invitationLink && (
                    <div className={styles.section}>
                      <label className={styles.field}>
                        <span>{t('inviteLink')}</span>
                        <Input
                          value={invitationLink}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </label>
                      <Button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(invitationLink);
                            toastManager.add({ title: t('copied'), type: 'success' });
                          } catch {
                            toastManager.add({ title: t('copyFailed'), type: 'error' });
                          }
                        }}
                      >
                        {t('copy')}
                      </Button>
                    </div>
                  )}
                  {data.invitations.length > 0 && (
                    <ul className={styles.list}>
                      {data.invitations.map((invite) => (
                        <li key={invite.id} className={styles.row}>
                          <span>{invite.email}</span>
                          <Button
                            disabled={pending}
                            onClick={() =>
                              command({
                                action: 'revoke',
                                teamId: active.id,
                                invitationId: invite.id,
                              })
                            }
                          >
                            {t('revoke')}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
          <section className={styles.section}>
            <h2 className={styles.heading}>{t('create')}</h2>
            <form className={styles.row} onSubmit={(event) => submit(event, 'create')}>
              <label className={styles.field}>
                <span>{t('name')}</span>
                <Input name="name" required maxLength={80} disabled={pending} />
              </label>
              <Button type="submit" variant="primary" disabled={pending}>
                {t('create')}
              </Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
