import React, {useContext, useState} from 'react';
import CommonHeader from './commonHeader.component';
import AnalysisQuestionsContext from 'js/components/processing/analysis/analysisQuestions.context';
import {
  hasUnsavedWork,
  findQuestion,
  getQuestionTypeDefinition,
  updateResponseAndReducer,
} from 'js/components/processing/analysis/utils';
// We don't use `KoboTagsInput` here, because we don't want the tags splitting
// feature it has built in. It's easier for us to use `TagsInput` directly.
import TagsInput from 'react-tagsinput';
import commonStyles from './common.module.scss';

interface TagsResponseFormProps {
  uuid: string;
}

/**
 * Displays a common header and a tags input.
 */
export default function TagsResponseForm(props: TagsResponseFormProps) {
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

  // This will either be an existing list of tags, or an empty list.
  const initialResponse = Array.isArray(question.response)
    ? question.response
    : [];

  const [response, setResponse] = useState<string[]>(initialResponse);

  function onTagsChange(newTags: string[]) {
    if (!analysisQuestions || !question) {
      return;
    }

    // Update local state
    setResponse(newTags);

    // Update endpoint and reducer
    updateResponseAndReducer(
      analysisQuestions.dispatch,
      props.uuid,
      question.type,
      newTags
    );
  }

  return (
    <>
      <CommonHeader uuid={props.uuid} />

      <section className={commonStyles.content}>
        <TagsInput
          value={response}
          onChange={onTagsChange}
          // Adds a listener to changes on the internal text field before
          // text is added as a tag
          inputProps={{
            onChange: () => {
              hasUnsavedWork(analysisQuestions?.dispatch);
            },
          }}
          onlyUnique
          addOnBlur
          addOnPaste
        />
      </section>
    </>
  );
}
