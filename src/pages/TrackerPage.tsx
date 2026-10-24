import React from 'react';
import { JobTrackerPage } from '@aicoe/aihub-platform/tracker';
import { salesJobSource } from '../features/jobs/jobSource';

/** `/sales/tracker`: every Sales research run, and only those. */
const TrackerPage: React.FC = () => <JobTrackerPage source={salesJobSource} />;

export default TrackerPage;
