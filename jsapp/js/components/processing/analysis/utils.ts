import type {AnalysisQuestionsState} from './analysisQuestions.reducer';
import type {AnalysisQuestionsAction} from './analysisQuestions.actions';
import type {
  AnalysisQuestionInternal,
  AnalysisQuestionType,
  AnalysisQuestionSchema,
  AnalysisResponseUpdateRequest,
  SubmissionProcessingDataResponse,
} from './constants';
import {ANALYSIS_QUESTION_TYPES} from './constants';
import {fetchPatch, fetchPostUrl, handleApiFail} from 'js/api';
import {endpoints} from 'js/api.endpoints';
import {getAssetAdvancedFeatures, getAssetProcessingUrl} from 'js/assetUtils';
import clonedeep from 'lodash.clonedeep';
import {NO_FEATURE_ERROR} from '../processingActions';
import {notify} from 'js/utils';
import type {
  AssetAdvancedFeatures,
  AssetResponse,
  FailResponse,
} from 'js/dataInterface';
import type {Json} from '../../common/common.interfaces';
import assetStore from 'js/assetStore';
import singleProcessingStore from '../singleProcessingStore';

/** Finds given question in state */
export function findQuestion(uuid: string, state: AnalysisQuestionsState) {
  return state.questions.find((question) => question.uuid === uuid);
}

/** Finds given question in schema object */
export function findQuestionInSchema(
  questionUuid: string,
  advancedFeatures: AssetAdvancedFeatures | undefined
) {
  return advancedFeatures?.qual?.qual_survey?.find(
    (item) => item.uuid === questionUuid
  );
}

/** Find a choice of a given question (if applicable) in schema object */
export function findQuestionChoiceInSchema(
  questionUuid: string,
  choiceUuid: string,
  advancedFeatures: AssetAdvancedFeatures | undefined
) {
  const question = findQuestionInSchema(questionUuid, advancedFeatures);
  return question?.choices?.find((item) => item.uuid === choiceUuid);
}

export function getQuestionTypeDefinition(type: AnalysisQuestionType) {
  return ANALYSIS_QUESTION_TYPES.find((definition) => definition.type === type);
}

/**
 * Builds schema definitions from question definitions. Useful for updating
 * questions definitions on endpoint.
 */
export function convertQuestionsFromInternalToSchema(
  questions: AnalysisQuestionInternal[]
): AnalysisQuestionSchema[] {
  return questions.map((question) => {
    return {
      uuid: question.uuid,
      type: question.type,
      labels: question.labels,
      options: question.options,
      choices: question.additionalFields?.choices,
      scope: 'by_question#survey',
      qpath: question.qpath,
    };
  });
}

/**
 * Build question definitions from schema definitions. Useful for initializing
 * the analysis questions UI after loading existing question definitions from
 * schema.
 */
export function convertQuestionsFromSchemaToInternal(
  questions: AnalysisQuestionSchema[]
): AnalysisQuestionInternal[] {
  return questions.map((question) => {
    const output: AnalysisQuestionInternal = {
      qpath: question.qpath,
      uuid: question.uuid,
      type: question.type,
      labels: question.labels,
      options: question.options,
      response: '',
    };
    if (question.choices) {
      output.additionalFields = {
        choices: question.choices,
      };
    }
    return output;
  });
}

/**
 * Updates the responses (AKA answers to analysis questions) in existing
 * internal questions list using the API endpoint response.
 */
export function applyUpdateResponseToInternalQuestions(
  qpath: string,
  updateResp: SubmissionProcessingDataResponse,
  questions: AnalysisQuestionInternal[]
): AnalysisQuestionInternal[] {
  const newQuestions = clonedeep(questions);
  const analysisResponses = updateResp[qpath]?.qual || [];
  newQuestions.forEach((question) => {
    const foundResponse = analysisResponses.find(
      (analResp) => question.uuid === analResp.uuid
    );

    if (foundResponse) {
      // QUAL_INTEGER CONVERSION HACK (PART 2/2):
      // Before putting the responses stored on Back end into the reducer, we
      // need to convert `qual_integer` response to string (from integer).
      if (typeof foundResponse.val === 'number') {
        question.response = String(foundResponse.val);
      } else {
        question.response = foundResponse.val;
      }
    }
  });
  return newQuestions;
}

/** Update a question in a list of questions preserving existing response. */
export function updateSingleQuestionPreservingResponse(
  questionToUpdate: AnalysisQuestionInternal,
  questions: AnalysisQuestionInternal[]
): AnalysisQuestionInternal[] {
  return clonedeep(questions).map((question) => {
    if (question.uuid === questionToUpdate.uuid) {
      // Preserve exsiting response, but update everything else
      return {...questionToUpdate, response: question.response};
    } else {
      return question;
    }
  });
}

export function getQuestionsFromSchema(
  advancedFeatures: AssetAdvancedFeatures | undefined
): AnalysisQuestionInternal[] {
  return convertQuestionsFromSchemaToInternal(
    advancedFeatures?.qual?.qual_survey || []
  );
}

/**
 * A function that updates the question definitions, i.e. the schema in the
 * advanced features of current asset.
 */
export async function updateSurveyQuestions(
  assetUid: string,
  questions: AnalysisQuestionInternal[]
) {
  // Step 1: Make sure not to mutate existing object
  const advancedFeatures = clonedeep(getAssetAdvancedFeatures(assetUid));

  if (!advancedFeatures) {
    notify(NO_FEATURE_ERROR, 'error');
    return Promise.reject(NO_FEATURE_ERROR);
  }

  // Step 2: make sure `qual` is an object
  if (!advancedFeatures.qual) {
    advancedFeatures.qual = {};
  }

  // Step 3: prepare the data for the endpoint
  advancedFeatures.qual.qual_survey = convertQuestionsFromInternalToSchema(
    questions
  );

  // Step 4: Update the data (yay!)
  try {
    const response = await fetchPatch<AssetResponse>(
      endpoints.ASSET_URL.replace(':uid', assetUid),
      {advanced_features: advancedFeatures as Json}
    );

    // TODO think of better way to handle this
    //
    // UPDATE ADVANCED FEATURES HACK (PART 2/2):
    // We need to let the `assetStore` know about the change, because
    // `analysisQuestions.reducer` is using `assetStore` to build the initial
    // list of questions every time user (re-)visits "Analysis" tab.
    // Without this line, user could see some old data.
    assetStore.onUpdateAssetCompleted(response);

    return response;
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * A function that updates the response for a question (i.e. the submission
 * data) on the Back end.
 */
async function updateResponse(
  processingUrl: string,
  submissionUid: string,
  qpath: string,
  analysisQuestionUuid: string,
  analysisQuestionType: AnalysisQuestionType,
  newResponse: string | string[] | number
) {
  try {
    const payload: AnalysisResponseUpdateRequest = {
      submission: submissionUid,
      [qpath]: {
        qual: [
          {
            uuid: analysisQuestionUuid,
            type: analysisQuestionType,
            val: newResponse,
          },
        ],
      },
    };

    const apiResponse = await fetchPostUrl<SubmissionProcessingDataResponse>(
      processingUrl,
      payload as Json
    );

    return {
      apiResponse: apiResponse,
      qpath: qpath,
    };
  } catch (err) {
    return Promise.reject(err);
  }
}

/**
 * A wrapper function for `updateResponse` that works with a reducer passed as
 * one of parameters. We use it to make the code more DRY, as most response
 * forms use the same code to store responses.
 *
 * Assumption 1: we assume that the data is being updated for the asset and
 * the submission currently being loaded by `singleProcessingStore`.
 *
 * Assumption 2: we assume that the `dispatch` passed here is from the
 * `analysisQuestions.context`.
 *
 * Note: all of the parameters are required for this function to actually save
 * some information, but it's easier to handle TypeScript nagging in one place
 * than in each one using this function, so we do it this ugly-ish way.
 */
export async function updateResponseAndReducer(
  dispatch: React.Dispatch<AnalysisQuestionsAction>,
  surveyQuestionQpath: string,
  analysisQuestionUUid: string,
  analysisQuestionType: AnalysisQuestionType,
  response: string | string[]
) {
  const processingUrl = getAssetProcessingUrl(
    singleProcessingStore.currentAssetUid
  );
  if (!processingUrl) {
    notify(NO_FEATURE_ERROR, 'error');
    return;
  }

  // Step 1: Let the reducer know what we're about to do
  dispatch({type: 'updateResponse'});

  // Step 2: QUAL_INTEGER CONVERSION HACK (PART 1/2):
  // For code simplicity (I hope so!) we handle `qual_integer` as string and
  // only convert it to/from actual integer when talking with Back end.
  let actualResponse: string | string[] | number = response;
  if (analysisQuestionType === 'qual_integer') {
    actualResponse = parseInt(String(response));
  }

  // Step 3: Store the response using the `advanced_submission_post` API
  try {
    const result = await updateResponse(
      processingUrl,
      singleProcessingStore.currentSubmissionEditId,
      surveyQuestionQpath,
      analysisQuestionUUid,
      analysisQuestionType,
      actualResponse
    );

    // Step 4A: tell reducer about success
    dispatch({
      type: 'updateResponseCompleted',
      payload: result,
    });
  } catch (err) {
    // Step 4B: tell reducer about failure
    handleApiFail(err as FailResponse);
    dispatch({type: 'updateResponseFailed'});
  }
}
