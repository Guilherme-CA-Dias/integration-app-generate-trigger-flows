This repository contains utility scripts for managing Integration App flows and actions.

## Trigger Flow Generator

The `generate-trigger-flows.mjs` script automatically generates trigger flows for all available data collections across your integrations. It creates flows that listen for data record events (created, updated, deleted) and sends these events to your API.

### Prerequisites

- Node.js installed
- Access to Integration App workspace
- Integration App SDK (`@integration-app/sdk`)
- Environment variables configured

### Setup

1. Create a `.env` file in your project root with the following variables:
```env
INTEGRATION_APP_WORKSPACE_KEY=your_workspace_key
INTEGRATION_APP_WORKSPACE_SECRET=your_workspace_secret
API_BASE_URL=https://api.integration.app
```

2. Install dependencies:
```bash
npm install @integration-app/sdk jsonwebtoken dotenv yaml
```

### Running the Script

To generate trigger flows:
```bash
node generate/generate-trigger-flows.mjs
```

The script will:
1. Connect to your Integration App workspace
2. Find all available integrations
3. For each integration:
   - Get all data collections
   - Create trigger flows for available events (created, updated, deleted)
   - Save flow templates as YAML files
   - Create flows in Integration App

### Output

Generated flows will be saved in:
```
dist/
└── flows/
    └── {integration_key}/
        └── {event_type}-{collection_key}-{integration_key}.yaml
```

### Flow Template Structure

Each generated flow includes:
- A trigger node configured for the specific data collection and event
- An API request node that sends events to your application
- Collection parameters (if required by the collection)
- Proper variable mapping for integration and connection context

### Error Handling

The script handles:
- Collections without events (skipped)
- Existing flows (skipped with notification)
- API rate limiting
- Detailed error logging

### Example Flow Template

```yaml
key: created-users-microsoft-teams
name: Created Users
integrationId: integration_id
nodes:
  trigger:
    type: data-record-created-trigger
    name: "created: Users"
    config:
      dataSource:
        collectionKey: users
  api-request-to-your-app:
    type: api-request-to-your-app
    name: Send event to API
    config:
      request:
        uri: /events
        method: POST
        body:
          integrationKey: $.integration.key
          connectionId: $.connection.id
          instanceKey: $.flowInstance.instanceKey
          triggerType: created
          data: $.input.trigger
```

## Troubleshooting

If you encounter issues:
1. Check your environment variables are correctly set
2. Ensure you have the required permissions in your Integration App workspace
3. Check the console output for detailed error messages
4. Verify your network connection to the Integration App API
