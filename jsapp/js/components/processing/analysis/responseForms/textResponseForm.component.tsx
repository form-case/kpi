import React, {useContext, useState} from 'react';
import TextBox from 'js/components/common/textBox';
import AnalysisQuestionsContext from 'js/components/processing/analysis/analysisQuestions.context';
import {AUTO_SAVE_TYPING_DELAY} from 'js/components/processing/analysis/constants';
import {
  hasUnsavedWork,
  findQuestion,
  getQuestionTypeDefinition,
  updateResponseAndReducer,
} from 'js/components/processing/analysis/utils';
import CommonHeader from './commonHeader.component';
import commonStyles from './common.module.scss';

interface TextResponseFormProps {
  uuid: string;
}

/**
 * Displays a common header and a string text box.
 */
export default function TextResponseForm(props: TextResponseFormProps) {
  const analysisQuestions = useContext(AnalysisQuestionsContext);
  if (!analysisQuestions) {
    return null;
  }

  // Get the question data from state (with safety check)
  const question = findQuestion(props.uuid, analysisQuestions.state);
  if (!question) {
    return null;
  }

  // Get the question definition (with safety check)
  const qaDefinition = getQuestionTypeDefinition(question.type);
  if (!qaDefinition) {
    return null;
  }

  // This will either be an existing response or an empty string
  const initialResponse =
    typeof question.response === 'string' ? question.response : '';

  const [response, setResponse] = useState<string>(initialResponse);
  const [typingTimer, setTypingTimer] = useState<NodeJS.Timeout>();

  async function saveResponse() {
    clearTimeout(typingTimer);

    if (!analysisQuestions || !question) {
      return;
    }

    updateResponseAndReducer(
      analysisQuestions.dispatch,
      props.uuid,
      question.type,
      response
    );
  }

  function saveResponseDelayedAndQuietly() {
    clearTimeout(typingTimer);
    // After 5 seconds we auto save
    setTypingTimer(setTimeout(saveResponse, AUTO_SAVE_TYPING_DELAY));
  }

  function onInputChange(newResponse: string) {
    hasUnsavedWork(analysisQuestions?.dispatch);
    setResponse(newResponse);
    saveResponseDelayedAndQuietly();
  }

  return (
    <>
      <CommonHeader uuid={props.uuid} />

      <section className={commonStyles.content}>
        <TextBox
          type='text-multiline'
          value={response}
          onChange={onInputChange}
          placeholder={t('Type your answer')}
          onBlur={saveResponse}
          customModifiers='on-white'
        />
      </section>
    </>
  );
}
