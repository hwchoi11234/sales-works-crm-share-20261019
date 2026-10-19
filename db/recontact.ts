// Shared SQL predicate for both the lobby and its atomic ownership claim.
// Aliases l (leads) and mt (lead_modification_times) are required.
export const recontactEligible = `
 l.owner_id IS NOT NULL
 AND l.status NOT IN ('계약 완료','종료')
 AND mt.updated_at <= ?
 AND NOT EXISTS (SELECT 1 FROM callbacks c WHERE c.lead_id=l.id AND c.status='예정' AND c.due_at >= ?)
 AND NOT EXISTS (SELECT 1 FROM meetings m WHERE m.lead_id=l.id AND json_extract(m.data,'$.status')='예정'
   AND json_extract(m.data,'$.date') || 'T' || json_extract(m.data,'$.end') >= ?)
`;
export function recontactTimes(now = new Date()) {
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .replace(' ', 'T');
  return [new Date(now.getTime() - 20 * 86400000).toISOString(), local, local];
}
