import React from 'react';
import { JobTrackerPage } from '@aicoe/aihub-platform/tracker';
import { salesJobSource } from './jobSource';

/** `/sales/tracker`: every Sales research run, and only those. */
const SalesTrackerRoute: React.FC = () => <JobTrackerPage source={salesJobSource} />;

export default SalesTrackerRoute;
