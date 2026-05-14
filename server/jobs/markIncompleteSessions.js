// server/jobs/markIncompleteSessions.js
// Runs at midnight (or on server startup) to close out sessions that were
// left ACTIVE from a previous day — i.e. the merchandiser never checked out.
//
// Usage:
//   const markIncompleteSessions = require('./jobs/markIncompleteSessions');
//   markIncompleteSessions();                     // run once on startup
//   cron.schedule('0 0 * * *', markIncompleteSessions); // or via node-cron

const CheckIn = require('../models/CheckIn');

module.exports = async function markIncompleteSessions() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const result = await CheckIn.updateMany(
      {
        sessionStatus: 'ACTIVE',
        date:          { $lt: today },   // any active session NOT from today
      },
      {
        $set: { sessionStatus: 'INCOMPLETE' },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[markIncompleteSessions] Marked ${result.modifiedCount} session(s) as INCOMPLETE`);
    }

    return result.modifiedCount;
  } catch (err) {
    console.error('[markIncompleteSessions] Error:', err.message);
    return 0;
  }
};