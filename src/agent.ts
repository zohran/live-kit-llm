import {
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  multimodal
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import path from "path";
import { fileURLToPath } from "url";
import { JobType } from "@livekit/protocol";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

// Convert import.meta.url to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;


function formatAssetData(assets: any) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return 'No assets found.';
  }

  const formattedAssets = assets
    .map((asset) => {
      const assetName = asset.msdyn_name;
      const categoryName = asset.msdyn_CustomerAssetCategory?.msdyn_name;
      const locationName = asset.msdyn_FunctionalLocation?.msdyn_name;

      return `${assetName} from category ${categoryName}, located at ${locationName}`;
    })
    .join(', ');

  return `Your assets include: ${formattedAssets}.`;
}


// Define the LiveKit Agent
export default defineAgent({
  entry: async (ctx: JobContext) => {
    try {
      await ctx.connect();
      console.log("Waiting for participant...");
      const participant = await ctx.waitForParticipant();
      console.log(
        `Starting assistant for participant: ${participant?.metadata}`
      );


      const participantMetadata = JSON.parse(participant.metadata)
      const participantMetadata2 = JSON.parse(participantMetadata)

      console.log('participantMetadata?.data?.customer: ', participantMetadata2?.data?.customer?.contactId);

      const model = new openai.realtime.RealtimeModel({
        instructions: `You are Lucy, the friendly AI assistant facilities management needs. Your role is to assist customers with facilities management-related inquiries, including case creation, report issue, case/issue reported updates, assets information, and account details. You should not provide technical advice. Confirm requests before proceeding and provide clear and concise updates. Maintain a customer-centric approach with polite and professional communication. Support interactions are in English only. keep the response in 1-2 lines without line breaks as it will be using for text to speech

              - Welcome the customer and ask how you can assist them.
              - Provide the requested information or update in a clear and concise manner.
              - Ensure the conversation remains focused on facilities management inquiries.
              - Thank the customer and offer any additional help at the end of the interaction.

              # Output Format

              - Use polite and professional language.
              - Maintain a conversational tone suitable for customer service.
              - Respond in complete sentences.
              - Confirm actions or requests clearly and concisely, summarizing key points where appropriate.

                  Ontegra Information: 

                      website: ontegra.ae
                      Located in: FIFTY ONE @ BUSINESS BAY
                      Address: Fifty One Tower - Marasi Dr - Business Bay - Dubai
                      Working Hours: 
                      Wednesday	8 AM–5:30 PM
                      Thursday	8 AM–5:30 PM
                      Friday	8 AM–5:30 PM
                      Saturday	8 AM–3 PM
                      Sunday	Closed
                      Monday	8 AM–5:30 PM
                      Tuesday	8 AM–5:30 PM;
                      customer care Phone: 800 668347`,
        apiKey: OPENAI_API_KEY,
        voice: "sage",
        temperature: 0.7,
        maxResponseOutputTokens: 3500,
        turnDetection: {
          type: "server_vad",
          threshold: 0.7,
          prefix_padding_ms: 1000,
          silence_duration_ms: 1000
        }
      });

      const fncCtx: llm.FunctionContext = {
        get_case: {
          description: 'get details of the case with case id or the latest created case ask the user for case id if not provided e.g what is the status of my case or what is the status of my case with id 23453',
          parameters: z.object({
            caseId: z.number().describe(`id of the case it should be: '12345' or 'CAS-12345' or 'CAS-12345-AB12C', if user wanted to pull a latest created case this should be empty string like :'' `),
          }),
          execute: async ({ caseId }) => {
            console.debug(`Executing get_case function for ${caseId}`);
            try {

              const myHeaders = new Headers();
              myHeaders.append("Authorization", `Bearer ${participantMetadata2?.data?.token}`);
              const response = await fetch(
                `https://api.dynamicsplus.pk/api/v0/cms/dynamic/incidents?$filter=_primarycontactid_value eq '${participantMetadata2?.data?.customer?.contactId}' and contains(ticketnumber,'${caseId}')&$select=ticketnumber,plus_levelofcompletion,createdon,description&$expand=plus_incident_bookableresourcebooking_case($expand=Resource($select=name))`,
                {
                  method: "GET",
                  headers: myHeaders,
                  body: null,
                  redirect: "follow",
                }
              );

              console.log('get_case API returned response : : :', response,)
              if (!response.ok) {
                throw new Error(
                  `get_case API returned status: ${response.status}`
                );
              }
              const ress = await response.text();


              console.log('get_case API returned res ressressressressresss : : :', ress,)

              return `if the case details is available speak case create status, description, ticketnumber and levelofcompletion or if case detials are null or undefined or empty say cannot find any case with case number for you account: 
              \n  Case details (JSON): ${JSON.stringify(
                ress
              )}. here in this Case details (JSON) 'ticketnumber' is the case ID.  \n 'ontegra_levelofcompletion' is the status of case.  \n Here are the possible status values and meaning of the status from 'ontegra_levelofcompletion':
                    1 - Case Created(The case has been successfully created and a technician has been assigned)
                    2 - Case Assigned(a technician is assigned to resolve your issue)
                    3 - Case Accepted(a technician is assigned to resolve your issue, he will reach your location on the job time to reolve the issue.)
                    4 - Travelling(technician is assigned and travelling to your location)
                    5 - Reached Site(technician is reached your site)
                    6 - Risk Assessed(technician is reached your site, checking site and started work)
                    7 -  Started(technician is reached your site and started work)
                    8 - Quote Required(team is working on quotes)
                    9 - Quote Issued(team is working on quotes)
                    10 - Quote Approved(team is working on quotes)
                    11 - Job Ready To Plan
                    12 - Job is Planned
                    13 - Travelling(technician is assigned and travelling to your location)
                    14 - Reached Site(technician is reached your site)
                    15 - Risk Assessed(technician is reached your site and started work)
                    16 - Job Started(technician is reached your site and started work)
                    17 - Job Completed(technician has completed the job)
                    18 - Case Cancelled(technician has completed the job)
                    19 - Awaiting Access(Awaiting for access to your location)
                    20 - Customer Not Available
                    21 - Case Resolve(Work is done successfully) \n
          
                    also write about the assigned technician: \n
                }\n
  
            \n note: give the response in maximum 2-3 line of text to speak. this reponse will be passed to Text to Speech`;
            } catch (error) {
              console.error(`Error fetching case data: ${error}`);
              return `I'm having trouble fetching the this case data for ${caseId}. Please try again later.`;
            }
          }
        },

        create_case: {
          description: 'Alegra will assist customers in creating a service case by gathering essential details such as the problem, asset (if applicable), and additional context to create a comprehensive case title and description. Dont create/log cases other than plumbing, electrical and AC related issues',
          parameters: z.object({
            title: z.string().describe(`Generate a concise title based on the customer’s issue, summarizing the problem, e.g., 'AC Not Cooling in Living Room.'`),
            description: z.string().describe(`Generate a detailed description that combines all customer-provided information. Include specifics of the issue and additional context gathered from follow-up questions.`),
            problemIssueId: z.string().describe(`Specify the problem based on user input by returning the relevant ID: Electrical Issue - '0f5532b3-9380-ef11-ac20-002248a2c8de', Plumbing Issue - '1c83cd82-9380-ef11-ac20-002248a2c8de', AC Issue - '099885fa-8c76-ef11-a670-000d3a676e32'.`),
          }),
          execute: async ({ title, description, problemIssueId }) => {
            console.debug(`Executing create_case function for ${title}`);

            const payload = {
              ontegra_area: false,
              title: title || "created from Alregra",
              description: description || "created from Alregra",
              caseorigincode: 4,
              "customerid_account@odata.bind": `/accounts(${participantMetadata2?.data?.customer?.accountId})`,
              "msdyn_incidenttype@odata.bind": "/msdyn_incidenttypes(38f53ec0-b579-ef11-ac20-7c1e52366543)", // Static
              "primarycontactid@odata.bind": `/contacts(${participantMetadata2?.data?.customer?.contactId})`,
              "ontegra_problemissue@odata.bind": `/ontegra_problemissues(${problemIssueId})`,
              ontegra_levelofcompletion: "1",
            };

            try {
              const myHeaders = new Headers();
              myHeaders.append("Authorization", `Bearer ${participantMetadata2?.data?.token}`);
              myHeaders.append("prefer", `return=representation`);
              myHeaders.append("Content-Type", "application/json");

              const response = await fetch(
                `https://api.dynamicsplus.pk/api/v0/cms/dynamic/incidents`,
                {
                  method: "POST",
                  headers: myHeaders,
                  body: JSON.stringify(payload),
                  redirect: "follow",
                }
              );

              console.log('create case API returned response : : :', response)

              if (!response.ok) {
                throw new Error(
                  `get_case API returned status: ${response.status}`
                );
              }
              const ressS = await response.text();
              console.log('get_case API returned res ressressressressresss : : :', ressS,)

              const ress = await response.json(); // Parse JSON response
              console.log('create_case API returned res:', ress);

              return `Case is created. Here are the details: ${ress}. here in details: 'ticketnumber' is the case ID \n note: give the response in maximum 2-3 line of text to speak. this reponse will be passed to Text to Speech`
            } catch (error) {
              console.error(`Error creating case: ${error}`);
              return `I'm having trouble creating the this case data for. Please try again later.`;
            }
          }
        },

        get_assets: {
          description: 'get details of all the user assets',
          parameters: z.object({
          }),
          execute: async ({ caseId }) => {
            console.debug(`Executing get assets function for `);
            try {
              const myHeaders = new Headers();
              myHeaders.append("Authorization", `Bearer ${participantMetadata2?.data?.token}`);
              const response = await fetch(
                `https://api.dynamicsplus.pk/api/v0/cms/dynamic/msdyn_customerassets?$select=msdyn_name,plus_description,msdyn_assettag&$expand=msdyn_CustomerAssetCategory($select=msdyn_name),msdyn_FunctionalLocation($select=msdyn_name)&$filter=_msdyn_functionallocation_value eq ${participantMetadata2?.data?.customer?.locationId}`,
                {
                  method: "GET",
                  headers: myHeaders,
                  body: null,
                  redirect: "follow",
                }
              );

              if (!response.ok) {
                throw new Error(
                  `get_case API returned status: ${response.status}`
                );
              }

              const assets = await response.text();
              console.log('get_assets API returned response : : :', assets)
              const result = formatAssetData(assets);

              return result;
            } catch (error) {
              console.error(`Error fetching get_assets: ${error}`);
              return `I'm having trouble fetching the assets data. Please try again later.`;
            }
          }
        },

        get_all_case: {
          description: 'get details of all of the cases opened or active. when user ask how many active cases/issues do I have or tell me about all of my active cases and their ids.',
          parameters: z.object({
          }),
          execute: async ({ caseId }) => {
            console.debug(`Executing get assets function for `);
            try {
              const myHeaders = new Headers();
              myHeaders.append("Authorization", `Bearer ${participantMetadata2?.data?.token}`);
              const response = await fetch(
                `https://api.dynamicsplus.pk/api/v0/cms/dynamic/incidents?$filter=_primarycontactid_value eq '${participantMetadata2?.data?.customer?.contactId}'&$select=ticketnumber,ontegra_levelofcompletion,createdon,description&$expand=ontegra_incident_bookableresourcebooking_case($select=createdon;$expand=Resource($select=name))`,
                {
                  method: "GET",
                  headers: myHeaders,
                  body: null,
                  redirect: "follow",
                }
              );

              console.log('get_all_case API returned response : : :', response)
              if (!response.ok) {
                throw new Error(
                  `get_case API returned status: ${response.status}`
                );
              }

              const allcases = await response.text();

              return `length of cases : ${allcases.length}
            \n  Cases details (JSON): ${JSON.stringify(
                allcases
              )}. here in this Case details (JSON) 'ticketnumber' is the case ID for each case.  \n 
            'ontegra_levelofcompletion' is the status of each case.  
  
          \n note: give the response in maximum 2-3 line of text to speak. this reponse will be passed to Text to Speech`

            } catch (error) {
              console.error(`Error fetching case data: ${error}`);
              return `I'm having trouble fetching the this casees data. Please try again later.`;
            }
          }
        },
        // weather: {
        //   description:
        //     `668347`,
        //   parameters: z.object({
        //     location: z.string().describe("The location to get the weather for")
        //   }),
        //   execute: async ({ location }) => {
        //     console.debug(`Executing weather function for ${location}`);
        //     try {
        //       const response = await fetch(
        //         `https://wttr.in/${location}?format=%C+%t`
        //       );
        //       if (!response.ok) {
        //         throw new Error(
        //           `Weather API returned status: ${response.status}`
        //         );
        //       }
        //       const weather = await response.text();
        //       return `The weather in ${location} is currently: ${weather}.`;
        //     } catch (error) {
        //       console.error(`Error fetching weather data: ${error}`);
        //       return `I'm having trouble fetching the weather data for ${location}. Please try again later.`;
        //     }
        //   }
        // },

      };

      const liveKitAgent = new multimodal.MultimodalAgent({
        model,
        fncCtx
      });

      // Function Call Debugging Logs
      liveKitAgent.on("function_call", (functionName, parameters) => {
        console.log(
          `Function call triggered: ${functionName} with parameters:`,
          parameters
        );
      });

      liveKitAgent.on("function_executed", (functionName, result) => {
        console.log(`Function executed: ${functionName}, result:`, result);
      });

      const session = await liveKitAgent
        .start(ctx.room, participant)
        .then((session) => session as openai.realtime.RealtimeSession);

      if (session) {
        console.log(
          `Agent successfully joined session for participant ${participant.identity}`
        );
      }

      session.conversation.item.create(
        llm.ChatMessage.create({
          role: llm.ChatRole.USER,
          text: "can you get me information of the latest case i have?"
        })
      );

      // session.conversation.item.create(
      //     llm.ChatMessage.create({
      //         role: llm.ChatRole.USER,
      //         text: 'Say "How can I help you today?"',
      //     }),
      // );

      session.response.create();

      liveKitAgent.on("agent_started_speaking", () => {
        console.log("Agent started speaking.");
      });

      liveKitAgent.on("agent_stopped_speaking", () => {
        console.log("Agent stopped speaking.");
      });

      liveKitAgent.on("error", (error) => {
        console.error("Error during agent function execution:", error);
      });
    } catch (error) {
      console.error("Error in agent entry function:", error);
    }
  }
});

// Add a delay before starting the LiveKit agent to avoid conflicts
setTimeout(async () => {
  try {
    await cli.runApp(
      new WorkerOptions({
        agent: path.resolve(__filename),
        apiKey: process.env.LIVEKIT_API_KEY, // Replace with your LiveKit API key
        apiSecret: process.env.LIVEKIT_API_SECRET, // Replace with your LiveKit API secret
        // url: process.env.LIVEKIT_URL,
        workerType: JobType.JT_ROOM
      })
    );
  } catch (error) {
    console.error("Error running LiveKit agent CLI:", error);
  }
}, 2000); // Delay of 2 seconds
