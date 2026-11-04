import React from 'react';
import { JobTrackerPage } from '@aicoe/aihub-platform/tracker';
import { salesJobSource } from '../features/jobs/jobSource';
import { LoadMoreRuns } from '../features/jobs/LoadMoreRuns';
import '../styles/sales-agent.css';

/** `/sales/tracker`: every Sales research run, and only those. */
const TrackerPage: React.FC = () => (
  <>
    <JobTrackerPage source={salesJobSource} />
    <LoadMoreRuns />
  </>
);

export default TrackerPage;
