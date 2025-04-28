import { IntegrationAppClient } from '@integration-app/sdk'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import fs from 'fs'
import yaml from 'yaml'

const WORKSPACE_KEY = process.env.INTEGRATION_APP_WORKSPACE_KEY
const WORKSPACE_SECRET = process.env.INTEGRATION_APP_WORKSPACE_SECRET

console.log('Starting flow generation script...')

if (!WORKSPACE_KEY || !WORKSPACE_SECRET) {
  throw new Error('INTEGRATION_APP_WORKSPACE_KEY and INTEGRATION_APP_WORKSPACE_SECRET must be set in .env file')
}

console.log('Generating JWT token...')
const tokenData = {
    isAdmin: true
}

const options = {
    issuer: WORKSPACE_KEY,
    // To prevent token from being used for too long
    expiresIn: 7200,
    // HS256 signing algorithm is used by default,
    // but we recommend to go with more secure option like HS512.
    algorithm: 'HS512'
}

const token = jwt.sign(tokenData, WORKSPACE_SECRET, options)
console.log('JWT token generated successfully')

console.log('Initializing Integration App client...')
const integrationApp = new IntegrationAppClient({
    token: token
})
console.log('Integration App client initialized')

function generateFlowTemplate(triggerType, collection, integration) {
    // Add parameters schema if the collection has one
    const flowParameters = collection.parametersSchema ? {
        "parametersSchema": collection.parametersSchema
    } : {}

    return {
        "key": `${triggerType}-${collection.key}-${integration.key}`,
        "name": `${triggerType} ${collection.name}`,
        "integrationId": integration.id,
        ...flowParameters,
        "nodes": {
            "trigger": {
                "type": `data-record-${triggerType}-trigger`,
                "name": `${triggerType}: ${collection.name}`,
                "config": {
                    "dataSource": {
                        "collectionKey": collection.key,
                        ...(collection.parametersSchema && {
                            "collectionParameters": {
                                "$var": "$.flowInstance.parameters"
                            }
                        })
                    }
                },
                "links": [
                    {
                        "key": "api-request-to-your-app"
                    }
                ]
            },
            "api-request-to-your-app": {
                "type": "api-request-to-your-app",
                "name": "Send event to API",
                "config": {
                    "request": {
                        "uri": "/events",
                        "method": "POST",
                        "body": {
                            "integrationKey": {
                                "$var": "$.integration.key"
                            },
                            "connectionId": {
                                "$var": "$.connection.id"
                            },
                            "instanceKey": {
                                "$var": "$.flowInstance.instanceKey"
                            },
                            "triggerType": triggerType,
                            "data": {
                                "$var": "$.input.trigger"
                            },
                            ...(collection.parametersSchema && {
                                "parameters": {
                                    "$var": "$.flowInstance.parameters"
                                }
                            })
                        }
                    }
                }
            }
        }
    }
}

async function main() {
    // Fetch all integrations
    console.log('Fetching integrations...')
    const integrations = await integrationApp.integrations.findAll()
    console.log(`Found ${integrations.length} integrations`)

    for (const integration of integrations) {
        console.log(`Processing integration: ${integration.key}`)
        
        try {
            // Get data collections for the integration
            const dataCollections = await integrationApp.integration(integration.key).getDataCollections()
            console.log(`Found ${dataCollections.length} data collections for ${integration.key}`)

            for (const collection of dataCollections) {
                console.log(`Processing collection: ${collection.key}`)
                
                try {
                    // Add a small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100))

                    // Get collection specification including available triggers
                    const collectionSpec = await integrationApp.integration(integration.key)
                        .getDataCollection(collection.key)
                    
                    // Add key to collectionSpec if it doesn't exist
                    collectionSpec.key = collection.key
                    collectionSpec.name = collection.name || collectionSpec.name

                    console.log(`Collection spec for ${collection.key}:`, {
                        key: collectionSpec.key,
                        name: collectionSpec.name,
                        events: collectionSpec.events,
                        parametersSchema: collectionSpec.parametersSchema
                    })

                    if (!collectionSpec.events) {
                        console.log(`No events found for collection ${collection.key}, skipping...`)
                        continue
                    }

                    // Get available events from the collection spec
                    const events = collectionSpec.events || {}
                    const availableEvents = Object.keys(events)

                    console.log(`Found ${availableEvents.length} events for collection ${collection.key}: ${availableEvents.join(', ')}`)

                    for (const eventType of availableEvents) {
                        console.log(`Processing event type: ${eventType}`)

                        try {
                            const flowTemplate = generateFlowTemplate(eventType, collectionSpec, integration)

                            // Create dist/flows directory if it doesn't exist
                            const dir = `./dist/flows/${integration.key}`
                            if (!fs.existsSync(dir)) {
                                console.log(`Creating directory: ${dir}`)
                                fs.mkdirSync(dir, { recursive: true })
                            }

                            // Write flow template to YAML file
                            const filePath = `${dir}/${flowTemplate.key}.yaml`
                            console.log(`Writing flow template to ${filePath}`)
                            fs.writeFileSync(
                                filePath,
                                yaml.stringify(flowTemplate)
                            )

                            // Send flow to Integration App
                            try {
                                console.log(`Creating flow: ${flowTemplate.key}`)
                                await integrationApp.flows.create(flowTemplate)
                                console.log(`Flow ${flowTemplate.key} created successfully`)
                            } catch (error) {
                                // Check if it's a BadRequestError due to existing flow
                                if (error.isIntegrationAppError && 
                                    error.data?.type === 'bad_request' && 
                                    error.data?.message?.includes('already exists')) {
                                    console.log(`Flow ${flowTemplate.key} already exists, skipping...`)
                                } else {
                                    console.error(`Error creating flow ${flowTemplate.key}:`, error.message)
                                }
                            }
                        } catch (error) {
                            console.error(`Error processing event ${eventType} for collection ${collection.key}:`, error.message)
                        }
                    }
                } catch (error) {
                    console.error(`Error processing collection ${collection.key}:`, error.message)
                }
            }
        } catch (error) {
            console.error(`Error processing integration ${integration.key}:`, error.message)
        }
    }

    console.log('Flow generation completed successfully')
}

main().catch(error => {
    console.error('Script failed:', error)
    process.exit(1)
}) 
