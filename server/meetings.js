export async function gatherMeeting(state,task,{save,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms)),timeout=60000}){
  const meeting=task.meeting;if(!meeting||meeting.status==='finished')return;
  const start=now();
  while(!meeting.participants.every(id=>meeting.arrived.includes(id))&&now()-start<timeout){await wait(300);}
  meeting.status='discussing';meeting.visualAttendanceComplete=meeting.participants.every(id=>meeting.arrived.includes(id));meeting.discussionStartedAt=new Date(now()).toISOString();await save();
}
export function recordArrival(task,agentId){
  if(!task?.meeting||task.status!=='working'||task.meeting.status!=='gathering'||!task.meeting.participants.includes(agentId))return false;
  if(!task.meeting.arrived.includes(agentId))task.meeting.arrived.push(agentId);return true;
}
