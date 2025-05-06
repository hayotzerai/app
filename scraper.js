import Outscraper from 'outscraper';

const client = new Outscraper('ZDg1NjBlNWU0ZmM0NGNlZjg4MGIwYzAxNjU1NDBkYjJ8Y2YwM2QyNmQ4NA');


export async function scrapeBusinessData(placeId) {
    try {
        // Start the Google Maps search with the provided place ID
        console.log('Place ID:', placeId);
        const initialResponse = await client.googleMapsReviews([placeId]);
        console.log('Initial Response:', initialResponse);

        // Check if the response contains a pending status (case-insensitive)
        if (!initialResponse || initialResponse.status.toLowerCase() !== 'pending') {
            throw new Error('Failed to initiate scraping or invalid response status');
        }

        const resultsLocation = initialResponse.results_location;
        if (!resultsLocation) {
            throw new Error('No results_location found in the response');
        }

        // Poll the results_location URL up to 10 times, every 3 seconds
        let attempts = 0;
        let finalResponse = null;

        while (attempts < 10) {
            console.log(`Polling attempt ${attempts + 1}...`);
            const response = await fetch(resultsLocation, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error while polling! Status: ${response.status}`);
            }

            const json = await response.json();
            console.log('Polled Response:', json);

            // Check if the status is success
            if (json.status.toLowerCase() === 'success') {
                finalResponse = json;
                break;
            }

            // Wait for 3 seconds before the next attempt
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;
        }

        if (!finalResponse) {
            throw new Error('Failed to retrieve completed data after 10 attempts');
        }

        // Parse the final response data
        const businessData = finalResponse.data;

        // Check if the data is empty or contains only an array of empty arrays
        if (!businessData || businessData.length === 0 || businessData.every(item => Array.isArray(item) && item.length === 0)) {
            throw new Error('No business found');
        }

        const business = businessData[0][0]; // Assuming the data is in the first element of the array

        const parsedData = {
            name: business.name,
            rating: business.rating,
            reviews: business.reviews || [],
            address: business.address,
            phone: business.phone,
            website: business.website,
            description: business.description,
            photos: business.photos || [],
            hours: business.hours || [],
            categories: business.categories || [],
            location: business.location || {}
        };

        console.log('Parsed business data:', parsedData);
        return parsedData;
    } catch (error) {
        console.error('Scraping error:', error);
        throw new Error(`Failed to scrape business data: ${error.message}`);
    }
}

export async function scrapeBusinessReviews(placeId) {
    try {
        console.log('Fetching reviews for Place ID:', placeId);
        const response = await client.googleMapsReviews([placeId]);

        // Check if response is valid
        if (!response || !Array.isArray(response) || response.length === 0) {
            console.log('No reviews found - returning empty array');
            return [];
        }

        // Extract reviews from the response
        const reviews = response[0]?.reviews_data || [];

        // If no reviews, return empty array
        if (!reviews || reviews.length === 0) {
            console.log('No reviews data found - returning empty array');
            return [];
        }

        // Map and filter the reviews
        const filteredReviews = reviews.map(review => ({
            author_title: review.author_title,
            author_image: review.author_image,
            review_text: review.review_text,
            review_rating: review.review_rating,
        }));

        console.log(`Found ${filteredReviews.length} reviews`);
        return filteredReviews.slice(-10);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        // Return empty array instead of throwing error
        return [];
    }
}