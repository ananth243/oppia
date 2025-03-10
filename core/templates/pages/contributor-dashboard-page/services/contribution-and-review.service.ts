// Copyright 2014 The Oppia Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS-IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * @fileoverview Service for fetching and resolving suggestions.
 */

import { downgradeInjectable } from '@angular/upgrade/static';
import { Injectable } from '@angular/core';
import { AppConstants } from 'app.constants';
import { ContributionAndReviewBackendApiService }
  from './contribution-and-review-backend-api.service';
import { SuggestionBackendDict } from 'domain/suggestion/suggestion.model';
import { StateBackendDict } from 'domain/state/StateObjectFactory';
import { ImagesData } from 'services/image-local-storage.service';

export interface OpportunityDict {
  'skill_id': string;
  'skill_description': string;
}

// Encapsulates the state necessary to fetch a particular suggestion from the
// backend.
class SuggestionFetcher {
  // Type of suggestion to fetch.
  type: string;
  // The current offset, i.e. the number of items to skip (from the beginning of
  // all matching results) in the next fetch.
  offset: number;
  // Cache of suggestions.
  suggestionIdToDetails: SuggestionDetailsDict;

  constructor(type: string) {
    this.type = type;
    this.offset = 0;
    this.suggestionIdToDetails = {};
  }
}

interface SuggestionDetailsDict {
  [targetId: string]: {
    suggestion: SuggestionBackendDict;
    details: OpportunityDict;
  };
}

// Represents a client-facing response to a fetch suggestion query.
interface FetchSuggestionsResponse {
  // A dict mapping suggestion ID to suggestion metadata.
  suggestionIdToDetails: SuggestionDetailsDict;
  // Whether there are more results to return after the last query.
  more: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ContributionAndReviewService {
  private activeTabType: string = null;
  private activeSuggestionType: string = null;

  constructor(
    private contributionAndReviewBackendApiService:
      ContributionAndReviewBackendApiService
  ) {}

  getActiveTabType(): string {
    return this.activeTabType;
  }

  setActiveTabType(activeTabType: string): void {
    this.activeTabType = activeTabType;
  }

  getActiveSuggestionType(): string {
    return this.activeSuggestionType;
  }

  setActiveSuggestionType(activeSuggestionType: string): void {
    this.activeSuggestionType = activeSuggestionType;
  }

  private userCreatedQuestionFetcher: SuggestionFetcher = (
    new SuggestionFetcher('SUBMITTED_QUESTION_SUGGESTIONS'));

  private reviewableQuestionFetcher: SuggestionFetcher = (
    new SuggestionFetcher('REVIEWABLE_QUESTION_SUGGESTIONS'));

  private userCreatedTranslationFetcher: SuggestionFetcher = (
    new SuggestionFetcher('SUBMITTED_TRANSLATION_SUGGESTIONS'));

  private reviewableTranslationFetcher: SuggestionFetcher = (
    new SuggestionFetcher('REVIEWABLE_TRANSLATION_SUGGESTIONS'));

  /**
   * Fetches suggestions from the backend.
   *
   * @param {SuggestionFetcher} fetcher - The fetcher for a particular
   *   suggestion type.
   * @param {boolean} shouldResetOffset - Whether to reset the input fetcher's
   *   offset to 0 and clear the fetcher's cache. Set this to true to fetch
   *   results starting from the beginning of all results matching the query.
   * @returns {Promise<FetchSuggestionsResponse>}
   */
  private async fetchSuggestionsAsync(
      fetcher: SuggestionFetcher, shouldResetOffset: boolean, topicName: string
  ): Promise<FetchSuggestionsResponse> {
    if (shouldResetOffset) {
      // Handle the case where we need to fetch starting from the beginning.
      fetcher.offset = 0;
      fetcher.suggestionIdToDetails = {};
    }
    const currentCacheSize: number = Object.keys(
      fetcher.suggestionIdToDetails).length;
    return (
      this.contributionAndReviewBackendApiService.fetchSuggestionsAsync(
        fetcher.type,
        // Fetch up to two pages at a time to compute if we have more results.
        // The first page of results is returned to the caller and the second
        // page is cached.
        (AppConstants.OPPORTUNITIES_PAGE_SIZE * 2) - currentCacheSize,
        fetcher.offset, topicName
      ).then((responseBody) => {
        const responseSuggestionIdToDetails = fetcher.suggestionIdToDetails;
        fetcher.suggestionIdToDetails = {};
        const targetIdToDetails = responseBody.target_id_to_opportunity_dict;
        responseBody.suggestions.forEach((suggestion) => {
          const suggestionDetails = {
            suggestion: suggestion,
            details: targetIdToDetails[suggestion.target_id]
          };
          const responseSize: number = Object.keys(
            responseSuggestionIdToDetails).length;
          if (responseSize < AppConstants.OPPORTUNITIES_PAGE_SIZE) {
            // Populate the response with up to a page's worth of results.
            responseSuggestionIdToDetails[
              suggestion.suggestion_id] = suggestionDetails;
          } else {
            // Cache the 2nd page.
            fetcher.suggestionIdToDetails[
              suggestion.suggestion_id] = suggestionDetails;
          }
        });
        fetcher.offset = responseBody.next_offset;
        return {
          suggestionIdToDetails: responseSuggestionIdToDetails,
          more: Object.keys(fetcher.suggestionIdToDetails).length > 0
        };
      })
    );
  }

  async getUserCreatedQuestionSuggestionsAsync(
      shouldResetOffset: boolean = true,
      topicName: string = 'All'):
  Promise<FetchSuggestionsResponse> {
    return this.fetchSuggestionsAsync(
      this.userCreatedQuestionFetcher, shouldResetOffset, topicName);
  }

  async getReviewableQuestionSuggestionsAsync(
      shouldResetOffset: boolean = true,
      topicName: string = 'All'):
  Promise<FetchSuggestionsResponse> {
    return this.fetchSuggestionsAsync(
      this.reviewableQuestionFetcher, shouldResetOffset, topicName);
  }

  async getUserCreatedTranslationSuggestionsAsync(
      shouldResetOffset: boolean = true,
      topicName: string = 'All'):
  Promise<FetchSuggestionsResponse> {
    return this.fetchSuggestionsAsync(
      this.userCreatedTranslationFetcher, shouldResetOffset, topicName);
  }

  async getReviewableTranslationSuggestionsAsync(
      shouldResetOffset: boolean = true,
      topicName: string = 'All'):
  Promise<FetchSuggestionsResponse> {
    return this.fetchSuggestionsAsync(
      this.reviewableTranslationFetcher, shouldResetOffset, topicName);
  }

  reviewExplorationSuggestion(
      targetId: string, suggestionId: string, action: string,
      reviewMessage: string, commitMessage: string,
      onSuccess: (suggestionId: string) => void,
      onFailure: (error) => void
  ): Promise<void> {
    const requestBody = {
      action: action,
      review_message: reviewMessage,
      commit_message: (
        action === AppConstants.ACTION_ACCEPT_SUGGESTION ?
        commitMessage : null
      )
    };

    return this.contributionAndReviewBackendApiService
      .reviewExplorationSuggestionAsync(
        targetId, suggestionId, requestBody
      ).then(() => {
        onSuccess(suggestionId);
      }, (error) => {
        onFailure && onFailure(error);
      });
  }

  reviewSkillSuggestion(
      targetId: string, suggestionId: string, action: string,
      reviewMessage: string, skillDifficulty: string,
      onSuccess: (suggestionId: string) => void,
      onFailure: () => void
  ): Promise<void> {
    const requestBody = {
      action: action,
      review_message: reviewMessage,
      skill_difficulty: skillDifficulty
    };

    return this.contributionAndReviewBackendApiService
      .reviewSkillSuggestionAsync(
        targetId, suggestionId, requestBody
      ).then(() => {
        onSuccess(suggestionId);
      }, () => {
        onFailure && onFailure();
      });
  }

  async updateTranslationSuggestionAsync(
      suggestionId: string, translationHtml: string,
      onSuccess: () => void,
      onFailure: (error) => void
  ): Promise<void> {
    const requestBody = {
      translation_html: translationHtml
    };

    return this.contributionAndReviewBackendApiService
      .updateTranslationSuggestionAsync(
        suggestionId, requestBody
      ).then(() => {
        onSuccess();
      }, (error) => onFailure && onFailure(error));
  }

  async updateQuestionSuggestionAsync(
      suggestionId: string, skillDifficulty: string,
      questionStateData: StateBackendDict, imagesData: ImagesData[],
      onSuccess: (suggestionId: string) => void,
      onFailure: (suggestionId: string) => void
  ): Promise<void> {
    const payload = {
      skill_difficulty: skillDifficulty,
      question_state_data: questionStateData
    };
    const requestBody = new FormData();
    requestBody.append('payload', JSON.stringify(payload));
    imagesData.forEach(obj => {
      if (obj.imageBlob !== null) {
        requestBody.append(obj.filename, obj.imageBlob);
      }
    });

    return this.contributionAndReviewBackendApiService
      .updateQuestionSuggestionAsync(
        suggestionId, requestBody
      ).then(() => {
        onSuccess(suggestionId);
      }, () => onFailure && onFailure(suggestionId));
  }
}

angular.module('oppia').factory('ContributionAndReviewService',
  downgradeInjectable(ContributionAndReviewService));
